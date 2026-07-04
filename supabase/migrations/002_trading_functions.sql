create or replace function public.calculate_hype_score(
  streaming_growth numeric,
  youtube_growth numeric,
  search_growth numeric,
  social_growth numeric,
  news_score numeric,
  trader_demand numeric
)
returns integer
language sql
immutable
as $$
  select greatest(
    1,
    least(
      99,
      round(
        50
        + (
          streaming_growth * 0.35
          + youtube_growth * 0.25
          + ((search_growth + social_growth) / 2) * 0.15
          + (news_score - 50) * 0.15
          + trader_demand * 0.10
        ) * 1.4
      )::integer
    )
  );
$$;

create or replace function public.get_active_season_id()
returns uuid
language sql
stable
as $$
  select id
  from public.seasons
  where status = 'active'
  order by start_date desc
  limit 1;
$$;

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

  select *
  into v_artist
  from public.artists
  where id = p_artist_id
    and is_active = true
  for update;

  if not found then
    raise exception 'Artist not found or inactive.';
  end if;

  select *
  into v_stats
  from public.artist_stats
  where artist_stats.artist_id = p_artist_id
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

  update public.artist_stats
  set trader_demand = v_trader_demand
  where artist_stats.artist_id = p_artist_id;

  update public.artists
  set
    current_price = v_updated_price,
    daily_change_percent = ((v_updated_price - previous_close) / previous_close) * 100,
    hype_score = v_hype_score,
    last_move_explanation = v_direction_label || v_artist.ticker || ' as trader demand moved the market.'
  where id = p_artist_id;

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
  p_shares numeric,
  p_season_id uuid default null
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
  v_season_id uuid := coalesce(p_season_id, public.get_active_season_id());
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

  if v_season_id is null then
    raise exception 'No active season is available.';
  end if;

  if p_shares is null or p_shares <= 0 then
    raise exception 'Shares must be greater than zero.';
  end if;

  select *
  into v_profile
  from public.profiles
  where id = v_user_id
  for update;

  if not found then
    raise exception 'Profile not found.';
  end if;

  select *
  into v_artist
  from public.artists
  where id = p_artist_id
    and is_active = true
  for update;

  if not found then
    raise exception 'Artist not found or inactive.';
  end if;

  v_order_value := round(p_shares * v_artist.current_price, 2);

  if v_profile.cash_balance < v_order_value then
    raise exception 'Not enough fake cash for this order.';
  end if;

  select *
  into v_holding
  from public.holdings
  where user_id = v_user_id
    and artist_id = p_artist_id
    and season_id = v_season_id
  for update;

  if found then
    v_total_shares := v_holding.shares + p_shares;
    v_average_buy_price := round(
      ((v_holding.average_buy_price * v_holding.shares) + v_order_value) / v_total_shares,
      2
    );

    update public.holdings
    set
      shares = v_total_shares,
      average_buy_price = v_average_buy_price
    where user_id = v_user_id
      and artist_id = p_artist_id
      and season_id = v_season_id;
  else
    v_total_shares := p_shares;
    v_average_buy_price := v_artist.current_price;

    insert into public.holdings (
      user_id,
      artist_id,
      season_id,
      shares,
      average_buy_price
    )
    values (
      v_user_id,
      p_artist_id,
      v_season_id,
      v_total_shares,
      v_average_buy_price
    );
  end if;

  update public.profiles
  set cash_balance = cash_balance - v_order_value
  where id = v_user_id
  returning * into v_profile;

  insert into public.transactions (
    user_id,
    artist_id,
    season_id,
    type,
    shares,
    price,
    cash_delta
  )
  values (
    v_user_id,
    p_artist_id,
    v_season_id,
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
  p_shares numeric,
  p_season_id uuid default null
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
  v_season_id uuid := coalesce(p_season_id, public.get_active_season_id());
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

  if v_season_id is null then
    raise exception 'No active season is available.';
  end if;

  if p_shares is null or p_shares <= 0 then
    raise exception 'Shares must be greater than zero.';
  end if;

  select *
  into v_profile
  from public.profiles
  where id = v_user_id
  for update;

  if not found then
    raise exception 'Profile not found.';
  end if;

  select *
  into v_artist
  from public.artists
  where id = p_artist_id
    and is_active = true
  for update;

  if not found then
    raise exception 'Artist not found or inactive.';
  end if;

  select *
  into v_holding
  from public.holdings
  where user_id = v_user_id
    and artist_id = p_artist_id
    and season_id = v_season_id
  for update;

  if not found or v_holding.shares < p_shares then
    raise exception 'You cannot sell more shares than you own.';
  end if;

  v_order_value := round(p_shares * v_artist.current_price, 2);
  v_remaining_shares := v_holding.shares - p_shares;
  v_average_buy_price := v_holding.average_buy_price;

  if v_remaining_shares <= 0.000001 then
    delete from public.holdings
    where user_id = v_user_id
      and artist_id = p_artist_id
      and season_id = v_season_id;

    v_remaining_shares := 0;
    v_average_buy_price := 0;
  else
    update public.holdings
    set shares = v_remaining_shares
    where user_id = v_user_id
      and artist_id = p_artist_id
      and season_id = v_season_id;
  end if;

  update public.profiles
  set cash_balance = cash_balance + v_order_value
  where id = v_user_id
  returning * into v_profile;

  insert into public.transactions (
    user_id,
    artist_id,
    season_id,
    type,
    shares,
    price,
    cash_delta
  )
  values (
    v_user_id,
    p_artist_id,
    v_season_id,
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
revoke all on function public.buy_artist_shares(text, numeric, uuid) from public;
revoke all on function public.sell_artist_shares(text, numeric, uuid) from public;
grant execute on function public.buy_artist_shares(text, numeric, uuid) to authenticated;
grant execute on function public.sell_artist_shares(text, numeric, uuid) to authenticated;

drop policy if exists "Users can insert own transactions" on public.transactions;
