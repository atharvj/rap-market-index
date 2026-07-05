-- Add account-level trading guardrails without changing the public trade API.
-- These limits reduce pump attempts while keeping normal portfolio building usable.

create index if not exists transactions_user_artist_created_idx
on public.transactions (user_id, artist_id, created_at desc);

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
  v_has_holding boolean := false;
  v_transaction_id uuid;
  v_order_value numeric;
  v_total_shares numeric;
  v_average_buy_price numeric;
  v_impact record;
  v_holdings_value numeric := 0;
  v_portfolio_value numeric := 0;
  v_existing_position_value numeric := 0;
  v_new_position_value numeric := 0;
  v_max_position_value numeric := 0;
  v_recent_artist_buy_value numeric := 0;
  v_daily_artist_buy_limit numeric := 0;
  v_recent_same_artist_trade_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'You must be signed in to trade.';
  end if;

  if p_shares is null or p_shares <= 0 then
    raise exception 'Shares must be greater than zero.';
  end if;

  if p_shares > 1000000 then
    raise exception 'Share amount is too large for one order.';
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

  v_has_holding := found;

  select coalesce(sum(h.shares * a.current_price), 0)
  into v_holdings_value
  from public.holdings as h
  join public.artists as a on a.id = h.artist_id
  where h.user_id = v_user_id;

  v_portfolio_value := v_profile.cash_balance + v_holdings_value;
  v_existing_position_value := coalesce(v_holding.shares, 0) * v_artist.current_price;
  v_new_position_value := v_existing_position_value + v_order_value;
  v_max_position_value := greatest(100, v_portfolio_value * 0.25);

  if v_new_position_value > v_max_position_value then
    raise exception 'Artist position limit is 25%% of portfolio value.';
  end if;

  select count(*)
  into v_recent_same_artist_trade_count
  from public.transactions as t
  where t.user_id = v_user_id
    and t.artist_id = p_artist_id
    and t.created_at >= now() - interval '30 seconds';

  if v_recent_same_artist_trade_count > 0 then
    raise exception 'Please wait before placing another order for this artist.';
  end if;

  select coalesce(sum(abs(t.cash_delta)), 0)
  into v_recent_artist_buy_value
  from public.transactions as t
  where t.user_id = v_user_id
    and t.artist_id = p_artist_id
    and t.type = 'buy'
    and t.created_at >= now() - interval '24 hours';

  v_daily_artist_buy_limit := greatest(1000, least(5000, v_portfolio_value * 0.4));

  if v_recent_artist_buy_value + v_order_value > v_daily_artist_buy_limit then
    raise exception 'Daily buy limit reached for this artist. Try again later.';
  end if;

  if v_has_holding then
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
  v_recent_same_artist_trade_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'You must be signed in to trade.';
  end if;

  if p_shares is null or p_shares <= 0 then
    raise exception 'Shares must be greater than zero.';
  end if;

  if p_shares > 1000000 then
    raise exception 'Share amount is too large for one order.';
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

  select count(*)
  into v_recent_same_artist_trade_count
  from public.transactions as t
  where t.user_id = v_user_id
    and t.artist_id = p_artist_id
    and t.created_at >= now() - interval '30 seconds';

  if v_recent_same_artist_trade_count > 0 then
    raise exception 'Please wait before placing another order for this artist.';
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

revoke all on function public.buy_artist_shares(text, numeric) from public, anon;
revoke all on function public.sell_artist_shares(text, numeric) from public, anon;

grant execute on function public.buy_artist_shares(text, numeric) to authenticated;
grant execute on function public.sell_artist_shares(text, numeric) to authenticated;
