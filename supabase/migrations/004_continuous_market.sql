drop view if exists public.season_leaderboard;
drop view if exists public.market_leaderboard;

alter table if exists public.price_history
  drop column if exists season_id;

alter table if exists public.transactions
  drop column if exists season_id;

drop index if exists public.holdings_user_season_idx;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'holdings'
      and column_name = 'season_id'
  ) then
    drop table if exists pg_temp.tmp_continuous_holdings;

    create temporary table tmp_continuous_holdings on commit drop as
    select
      user_id,
      artist_id,
      sum(shares) as shares,
      round(sum(shares * average_buy_price) / nullif(sum(shares), 0), 2) as average_buy_price,
      max(updated_at) as updated_at
    from public.holdings
    group by user_id, artist_id;

    truncate table public.holdings;

    alter table public.holdings
      drop constraint if exists holdings_pkey;

    alter table public.holdings
      drop column season_id;

    insert into public.holdings (
      user_id,
      artist_id,
      shares,
      average_buy_price,
      updated_at
    )
    select
      user_id,
      artist_id,
      shares,
      coalesce(average_buy_price, 1),
      updated_at
    from tmp_continuous_holdings
    where shares > 0;
  else
    alter table public.holdings
      drop constraint if exists holdings_pkey;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.holdings'::regclass
      and conname = 'holdings_pkey'
  ) then
    alter table public.holdings
      add constraint holdings_pkey primary key (user_id, artist_id);
  end if;
end;
$$;

create index if not exists holdings_user_idx on public.holdings (user_id);

drop function if exists public.buy_artist_shares(text, numeric, uuid);
drop function if exists public.sell_artist_shares(text, numeric, uuid);
drop function if exists public.get_active_season_id();

drop table if exists public.seasons cascade;
drop type if exists season_status;

create or replace view public.market_leaderboard as
select
  p.id as user_id,
  p.username,
  p.cash_balance + coalesce(sum(h.shares * a.current_price), 0) as portfolio_value,
  p.cash_balance,
  coalesce(sum(h.shares * a.current_price), 0) as holdings_value,
  ((p.cash_balance + coalesce(sum(h.shares * a.current_price), 0) - 10000) / 10000) * 100 as gain_percent
from public.profiles p
left join public.holdings h on h.user_id = p.id
left join public.artists a on a.id = h.artist_id
group by p.id, p.username, p.cash_balance;

create or replace function public.apply_artist_trade_impact(
  p_artist_id text,
  p_order_value numeric,
  p_direction integer
)
returns table (
  artist_id text,
  ticker text,
  execution_price numeric,
  updated_price numeric,
  price_impact_percent numeric,
  daily_change_percent numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_artist public.artists%rowtype;
  v_stats public.artist_stats%rowtype;
  v_impact numeric;
  v_updated_price numeric;
  v_trader_demand numeric;
  v_hype_score integer;
  v_direction_label text;
begin
  if p_direction not in (-1, 1) then
    raise exception 'Trade direction must be 1 or -1.';
  end if;

  select a.*
  into v_artist
  from public.artists as a
  where a.id = p_artist_id
    and a.is_active = true
  for update;

  if not found then
    raise exception 'Artist not found or inactive.';
  end if;

  select s.*
  into v_stats
  from public.artist_stats as s
  where s.artist_id = p_artist_id
  for update;

  if not found then
    insert into public.artist_stats (artist_id)
    values (p_artist_id)
    returning * into v_stats;
  end if;

  v_impact := least(greatest((p_order_value / 10000) * 0.028 * v_artist.volatility, 0.001), 0.045);
  v_updated_price := round(greatest(1, v_artist.current_price * (1 + p_direction * v_impact)), 2);
  v_trader_demand := greatest(-40, least(40, v_stats.trader_demand + p_direction * v_impact * 240));
  v_hype_score := public.calculate_hype_score(
    v_stats.streaming_growth,
    v_stats.youtube_growth,
    v_stats.search_growth,
    v_stats.social_growth,
    v_stats.news_score,
    v_trader_demand
  );
  v_direction_label := case
    when p_direction = 1 then 'Buy pressure lifted '
    else 'Selling pressure cooled '
  end;

  update public.artist_stats as s
  set trader_demand = v_trader_demand
  where s.artist_id = p_artist_id;

  update public.artists as a
  set
    current_price = v_updated_price,
    daily_change_percent = ((v_updated_price - a.previous_close) / a.previous_close) * 100,
    hype_score = v_hype_score,
    last_move_explanation = v_direction_label || v_artist.ticker || ' as trader demand moved the market.'
  where a.id = p_artist_id;

  return query
  select
    v_artist.id,
    v_artist.ticker,
    v_artist.current_price,
    v_updated_price,
    v_impact * 100,
    ((v_updated_price - v_artist.previous_close) / v_artist.previous_close) * 100;
end;
$$;

create or replace function public.buy_artist_shares(
  p_artist_id text,
  p_shares numeric
)
returns table (
  transaction_id uuid,
  artist_id text,
  ticker text,
  shares numeric,
  execution_price numeric,
  order_value numeric,
  cash_balance numeric,
  shares_owned numeric,
  average_buy_price numeric,
  updated_artist_price numeric,
  price_impact_percent numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_artist public.artists%rowtype;
  v_holding public.holdings%rowtype;
  v_transaction_id uuid;
  v_order_value numeric;
  v_total_shares numeric;
  v_average_buy_price numeric;
  v_impact record;
begin
  if v_user_id is null then
    raise exception 'You must be signed in to trade.';
  end if;

  if p_shares is null or p_shares <= 0 then
    raise exception 'Shares must be greater than zero.';
  end if;

  select p.*
  into v_profile
  from public.profiles as p
  where p.id = v_user_id
  for update;

  if not found then
    raise exception 'Profile not found.';
  end if;

  select a.*
  into v_artist
  from public.artists as a
  where a.id = p_artist_id
    and a.is_active = true
  for update;

  if not found then
    raise exception 'Artist not found or inactive.';
  end if;

  v_order_value := round(p_shares * v_artist.current_price, 2);

  if v_profile.cash_balance < v_order_value then
    raise exception 'Not enough cash for this order.';
  end if;

  select h.*
  into v_holding
  from public.holdings as h
  where h.user_id = v_user_id
    and h.artist_id = p_artist_id
  for update;

  if found then
    v_total_shares := v_holding.shares + p_shares;
    v_average_buy_price := round(
      ((v_holding.average_buy_price * v_holding.shares) + v_order_value) / v_total_shares,
      2
    );

    update public.holdings as h
    set
      shares = v_total_shares,
      average_buy_price = v_average_buy_price
    where h.user_id = v_user_id
      and h.artist_id = p_artist_id;
  else
    v_total_shares := p_shares;
    v_average_buy_price := v_artist.current_price;

    insert into public.holdings (
      user_id,
      artist_id,
      shares,
      average_buy_price
    )
    values (
      v_user_id,
      p_artist_id,
      v_total_shares,
      v_average_buy_price
    );
  end if;

  update public.profiles as p
  set cash_balance = p.cash_balance - v_order_value
  where p.id = v_user_id
  returning * into v_profile;

  insert into public.transactions (
    user_id,
    artist_id,
    type,
    shares,
    price,
    cash_delta
  )
  values (
    v_user_id,
    p_artist_id,
    'buy',
    p_shares,
    v_artist.current_price,
    -v_order_value
  )
  returning id into v_transaction_id;

  select *
  into v_impact
  from public.apply_artist_trade_impact(p_artist_id, v_order_value, 1);

  return query
  select
    v_transaction_id,
    p_artist_id,
    v_artist.ticker,
    p_shares,
    v_artist.current_price,
    v_order_value,
    v_profile.cash_balance,
    v_total_shares,
    v_average_buy_price,
    v_impact.updated_price,
    v_impact.price_impact_percent;
end;
$$;

create or replace function public.sell_artist_shares(
  p_artist_id text,
  p_shares numeric
)
returns table (
  transaction_id uuid,
  artist_id text,
  ticker text,
  shares numeric,
  execution_price numeric,
  order_value numeric,
  cash_balance numeric,
  shares_owned numeric,
  average_buy_price numeric,
  updated_artist_price numeric,
  price_impact_percent numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_artist public.artists%rowtype;
  v_holding public.holdings%rowtype;
  v_transaction_id uuid;
  v_order_value numeric;
  v_remaining_shares numeric;
  v_average_buy_price numeric;
  v_impact record;
begin
  if v_user_id is null then
    raise exception 'You must be signed in to trade.';
  end if;

  if p_shares is null or p_shares <= 0 then
    raise exception 'Shares must be greater than zero.';
  end if;

  select p.*
  into v_profile
  from public.profiles as p
  where p.id = v_user_id
  for update;

  if not found then
    raise exception 'Profile not found.';
  end if;

  select a.*
  into v_artist
  from public.artists as a
  where a.id = p_artist_id
    and a.is_active = true
  for update;

  if not found then
    raise exception 'Artist not found or inactive.';
  end if;

  select h.*
  into v_holding
  from public.holdings as h
  where h.user_id = v_user_id
    and h.artist_id = p_artist_id
  for update;

  if not found or v_holding.shares < p_shares then
    raise exception 'You cannot sell more shares than you own.';
  end if;

  v_order_value := round(p_shares * v_artist.current_price, 2);
  v_remaining_shares := v_holding.shares - p_shares;
  v_average_buy_price := v_holding.average_buy_price;

  if v_remaining_shares <= 0.000001 then
    delete from public.holdings as h
    where h.user_id = v_user_id
      and h.artist_id = p_artist_id;

    v_remaining_shares := 0;
    v_average_buy_price := 0;
  else
    update public.holdings as h
    set shares = v_remaining_shares
    where h.user_id = v_user_id
      and h.artist_id = p_artist_id;
  end if;

  update public.profiles as p
  set cash_balance = p.cash_balance + v_order_value
  where p.id = v_user_id
  returning * into v_profile;

  insert into public.transactions (
    user_id,
    artist_id,
    type,
    shares,
    price,
    cash_delta
  )
  values (
    v_user_id,
    p_artist_id,
    'sell',
    p_shares,
    v_artist.current_price,
    v_order_value
  )
  returning id into v_transaction_id;

  select *
  into v_impact
  from public.apply_artist_trade_impact(p_artist_id, v_order_value, -1);

  return query
  select
    v_transaction_id,
    p_artist_id,
    v_artist.ticker,
    p_shares,
    v_artist.current_price,
    v_order_value,
    v_profile.cash_balance,
    v_remaining_shares,
    v_average_buy_price,
    v_impact.updated_price,
    v_impact.price_impact_percent;
end;
$$;

revoke all on function public.apply_artist_trade_impact(text, numeric, integer) from public;
revoke all on function public.buy_artist_shares(text, numeric) from public, anon;
revoke all on function public.sell_artist_shares(text, numeric) from public, anon;

grant execute on function public.buy_artist_shares(text, numeric) to authenticated;
grant execute on function public.sell_artist_shares(text, numeric) to authenticated;
