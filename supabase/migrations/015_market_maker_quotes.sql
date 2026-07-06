-- HSX-style virtual specialist mechanics:
-- - guaranteed execution at a synthetic bid/ask quote
-- - wider spreads and more slippage for volatile/thin names
-- - market quote movement remains capped separately from execution spread

create or replace function public.calculate_artist_market_quote(
  p_artist_id text,
  p_shares numeric default 1
)
returns table (
  artist_id text,
  ticker text,
  mid_price numeric,
  bid_price numeric,
  ask_price numeric,
  buy_execution_price numeric,
  sell_execution_price numeric,
  spread_percent numeric,
  slippage_percent numeric,
  liquidity_score numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_artist public.artists%rowtype;
  v_mid_price numeric;
  v_volatility numeric;
  v_price_spread numeric;
  v_spread numeric;
  v_liquidity_base numeric;
  v_reference_order_value numeric;
  v_slippage numeric;
begin
  if p_shares is null or p_shares <= 0 then
    raise exception 'Shares must be greater than zero.';
  end if;

  select a.*
  into v_artist
  from public.artists as a
  where a.id = p_artist_id
    and a.is_active = true;

  if not found then
    raise exception 'Artist not found or inactive.';
  end if;

  v_mid_price := greatest(1, v_artist.current_price);
  v_volatility := greatest(0.5, coalesce(v_artist.volatility, 1));
  v_price_spread := case
    when v_mid_price < 10 then 0.006
    when v_mid_price < 25 then 0.004
    when v_mid_price < 50 then 0.0025
    else 0.0015
  end;
  v_spread := least(0.035, greatest(0.006, 0.004 + v_volatility * 0.003 + v_price_spread));
  v_liquidity_base := greatest(10000, least(160000, (90000 / v_volatility) + v_mid_price * 350));
  v_reference_order_value := p_shares * v_mid_price;
  v_slippage := least(
    0.018,
    power(greatest(v_reference_order_value / v_liquidity_base, 0), 0.7) * 0.0032 * v_volatility
  );

  return query
  select
    v_artist.id,
    v_artist.ticker,
    round(v_mid_price, 2),
    round(greatest(1, v_mid_price * (1 - v_spread / 2)), 2),
    round(greatest(1, v_mid_price * (1 + v_spread / 2)), 2),
    round(greatest(1, v_mid_price * (1 + v_spread / 2 + v_slippage)), 2),
    round(greatest(1, v_mid_price * (1 - v_spread / 2 - v_slippage)), 2),
    round(v_spread * 100, 4),
    round(v_slippage * 100, 4),
    round(greatest(1, least(100, 100 - v_spread * 1300 - v_slippage * 900 - greatest(v_volatility - 1, 0) * 10)), 2);
end;
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
  v_effective_order_value numeric;
  v_liquidity_base numeric;
  v_raw_impact numeric;
  v_impact numeric;
  v_updated_price numeric;
  v_trader_demand numeric;
  v_hype_score integer;
  v_current_directional_move numeric;
  v_remaining_directional_cap numeric;
  v_daily_trade_cap numeric;
  v_per_order_cap numeric;
begin
  if p_direction not in (-1, 1) then
    raise exception 'Trade direction must be 1 or -1.';
  end if;

  if p_order_value <= 0 then
    raise exception 'Order value must be greater than zero.';
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

  v_liquidity_base := greatest(
    10000,
    least(160000, (90000 / greatest(v_artist.volatility, 0.5)) + greatest(v_artist.current_price, 1) * 350)
  );
  v_daily_trade_cap := least(0.022, greatest(0.012, 0.011 + greatest(v_artist.volatility, 0.5) * 0.004));
  v_per_order_cap := least(0.006, greatest(0.0025, 0.0025 + greatest(v_artist.volatility, 0.5) * 0.0012));
  v_effective_order_value := least(greatest(p_order_value, 0), 25000);
  v_raw_impact := least(
    power(v_effective_order_value / v_liquidity_base, 0.7) * 0.0045 * greatest(v_artist.volatility, 0.5),
    v_per_order_cap
  );

  v_current_directional_move := case
    when p_direction = 1 then greatest(0, (v_artist.current_price - v_artist.previous_close) / nullif(v_artist.previous_close, 0))
    else greatest(0, (v_artist.previous_close - v_artist.current_price) / nullif(v_artist.previous_close, 0))
  end;
  v_remaining_directional_cap := greatest(0, v_daily_trade_cap - coalesce(v_current_directional_move, 0));
  v_impact := least(v_raw_impact, v_remaining_directional_cap);

  v_updated_price := round(greatest(1, v_artist.current_price * (1 + p_direction * v_impact)), 2);
  v_trader_demand := greatest(-40, least(40, v_stats.trader_demand + p_direction * v_impact * 120));
  v_hype_score := public.calculate_hype_score(
    v_stats.streaming_growth,
    v_stats.youtube_growth,
    v_stats.search_growth,
    v_stats.social_growth,
    v_stats.news_score,
    v_trader_demand
  );

  update public.artist_stats as s
  set trader_demand = v_trader_demand
  where s.artist_id = p_artist_id;

  update public.artists as a
  set
    current_price = v_updated_price,
    daily_change_percent = ((v_updated_price - a.previous_close) / nullif(a.previous_close, 0)) * 100,
    hype_score = v_hype_score,
    last_move_explanation = case
      when v_impact > 0 and p_direction = 1 then 'Buy-side activity nudged ' || v_artist.ticker || ' higher.'
      when v_impact > 0 and p_direction = -1 then 'Sell-side activity nudged ' || v_artist.ticker || ' lower.'
      else a.last_move_explanation
    end
  where a.id = p_artist_id;

  insert into public.price_ticks (
    artist_id,
    price,
    source,
    raw_payload
  )
  values (
    p_artist_id,
    v_updated_price,
    'trade',
    jsonb_build_object(
      'ticker', v_artist.ticker,
      'direction', p_direction,
      'orderValue', p_order_value,
      'impactPercent', v_impact * 100,
      'rawImpactPercent', v_raw_impact * 100,
      'liquidityBase', v_liquidity_base,
      'dailyTradeCapPercent', v_daily_trade_cap * 100
    )
  );

  return query
  select
    v_artist.id,
    v_artist.ticker,
    v_artist.current_price,
    v_updated_price,
    v_impact * 100,
    ((v_updated_price - v_artist.previous_close) / nullif(v_artist.previous_close, 0)) * 100;
end;
$$;

drop function if exists public.buy_artist_shares(text, numeric, boolean);
drop function if exists public.sell_artist_shares(text, numeric, boolean);

create or replace function public.buy_artist_shares(
  p_artist_id text,
  p_shares numeric,
  p_market_eligible boolean default true
)
returns table (
  transaction_id uuid,
  artist_id text,
  ticker text,
  shares numeric,
  execution_price numeric,
  order_value numeric,
  gross_order_value numeric,
  commission numeric,
  cash_balance numeric,
  shares_owned numeric,
  average_buy_price numeric,
  updated_artist_price numeric,
  price_impact_percent numeric,
  market_eligible boolean,
  quote_bid_price numeric,
  quote_ask_price numeric,
  spread_percent numeric,
  slippage_percent numeric,
  liquidity_score numeric
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
  v_quote record;
  v_execution_price numeric;
  v_order_value numeric;
  v_commission numeric;
  v_total_debit numeric;
  v_total_shares numeric;
  v_average_buy_price numeric;
  v_impact record;
  v_updated_artist_price numeric;
  v_price_impact_percent numeric := 0;
  v_holdings_value numeric := 0;
  v_portfolio_value numeric := 0;
  v_existing_position_value numeric := 0;
  v_new_position_value numeric := 0;
  v_max_position_value numeric := 0;
  v_recent_artist_buy_value numeric := 0;
  v_daily_artist_buy_limit numeric := 0;
  v_recent_same_artist_trade_count integer := 0;
  v_market_eligible boolean := coalesce(p_market_eligible, true);
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

  select *
  into v_quote
  from public.calculate_artist_market_quote(p_artist_id, p_shares);

  v_execution_price := v_quote.buy_execution_price;
  v_order_value := round(p_shares * v_execution_price, 2);

  if v_order_value < 1 then
    raise exception 'Order value must be at least $1.';
  end if;

  v_commission := public.calculate_trade_commission(v_order_value, p_shares);
  v_total_debit := v_order_value + v_commission;

  if v_profile.cash_balance < v_total_debit then
    raise exception 'Not enough cash for this order including commission.';
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

  select coalesce(sum(t.gross_value), 0)
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
    v_average_buy_price := v_execution_price;

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
  set cash_balance = p.cash_balance - v_total_debit
  where p.id = v_user_id
  returning * into v_profile;

  insert into public.transactions (
    user_id,
    artist_id,
    type,
    shares,
    price,
    gross_value,
    commission,
    cash_delta,
    market_eligible
  )
  values (
    v_user_id,
    p_artist_id,
    'buy',
    p_shares,
    v_execution_price,
    v_order_value,
    v_commission,
    -v_total_debit,
    v_market_eligible
  )
  returning id into v_transaction_id;

  v_updated_artist_price := v_artist.current_price;

  if v_market_eligible then
    select *
    into v_impact
    from public.apply_artist_trade_impact(p_artist_id, v_order_value, 1);

    v_updated_artist_price := v_impact.updated_price;
    v_price_impact_percent := v_impact.price_impact_percent;
  end if;

  return query
  select
    v_transaction_id,
    p_artist_id,
    v_artist.ticker,
    p_shares,
    v_execution_price,
    v_order_value,
    v_order_value,
    v_commission,
    v_profile.cash_balance,
    v_total_shares,
    v_average_buy_price,
    v_updated_artist_price,
    v_price_impact_percent,
    v_market_eligible,
    v_quote.bid_price,
    v_quote.ask_price,
    v_quote.spread_percent,
    v_quote.slippage_percent,
    v_quote.liquidity_score;
end;
$$;

create or replace function public.sell_artist_shares(
  p_artist_id text,
  p_shares numeric,
  p_market_eligible boolean default true
)
returns table (
  transaction_id uuid,
  artist_id text,
  ticker text,
  shares numeric,
  execution_price numeric,
  order_value numeric,
  gross_order_value numeric,
  commission numeric,
  cash_balance numeric,
  shares_owned numeric,
  average_buy_price numeric,
  updated_artist_price numeric,
  price_impact_percent numeric,
  market_eligible boolean,
  quote_bid_price numeric,
  quote_ask_price numeric,
  spread_percent numeric,
  slippage_percent numeric,
  liquidity_score numeric
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
  v_quote record;
  v_execution_price numeric;
  v_order_value numeric;
  v_commission numeric;
  v_net_credit numeric;
  v_remaining_shares numeric;
  v_average_buy_price numeric;
  v_impact record;
  v_updated_artist_price numeric;
  v_price_impact_percent numeric := 0;
  v_recent_same_artist_trade_count integer := 0;
  v_market_eligible boolean := coalesce(p_market_eligible, true);
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

  select *
  into v_quote
  from public.calculate_artist_market_quote(p_artist_id, p_shares);

  v_execution_price := v_quote.sell_execution_price;
  v_order_value := round(p_shares * v_execution_price, 2);

  if v_order_value < 1 then
    raise exception 'Order value must be at least $1.';
  end if;

  v_commission := public.calculate_trade_commission(v_order_value, p_shares);
  v_net_credit := v_order_value - v_commission;

  if v_net_credit <= 0 then
    raise exception 'Order value is too small after commission.';
  end if;

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
  set cash_balance = p.cash_balance + v_net_credit
  where p.id = v_user_id
  returning * into v_profile;

  insert into public.transactions (
    user_id,
    artist_id,
    type,
    shares,
    price,
    gross_value,
    commission,
    cash_delta,
    market_eligible
  )
  values (
    v_user_id,
    p_artist_id,
    'sell',
    p_shares,
    v_execution_price,
    v_order_value,
    v_commission,
    v_net_credit,
    v_market_eligible
  )
  returning id into v_transaction_id;

  v_updated_artist_price := v_artist.current_price;

  if v_market_eligible then
    select *
    into v_impact
    from public.apply_artist_trade_impact(p_artist_id, v_order_value, -1);

    v_updated_artist_price := v_impact.updated_price;
    v_price_impact_percent := v_impact.price_impact_percent;
  end if;

  return query
  select
    v_transaction_id,
    p_artist_id,
    v_artist.ticker,
    p_shares,
    v_execution_price,
    v_order_value,
    v_order_value,
    v_commission,
    v_profile.cash_balance,
    v_remaining_shares,
    v_average_buy_price,
    v_updated_artist_price,
    v_price_impact_percent,
    v_market_eligible,
    v_quote.bid_price,
    v_quote.ask_price,
    v_quote.spread_percent,
    v_quote.slippage_percent,
    v_quote.liquidity_score;
end;
$$;

revoke all on function public.calculate_artist_market_quote(text, numeric) from public, anon;
revoke all on function public.buy_artist_shares(text, numeric, boolean) from public, anon;
revoke all on function public.sell_artist_shares(text, numeric, boolean) from public, anon;

grant execute on function public.calculate_artist_market_quote(text, numeric) to authenticated;
grant execute on function public.buy_artist_shares(text, numeric, boolean) to authenticated;
grant execute on function public.sell_artist_shares(text, numeric, boolean) to authenticated;

notify pgrst, 'reload schema';
