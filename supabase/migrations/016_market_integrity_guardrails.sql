-- Market integrity guardrails:
-- - new accounts can trade, but their orders do not move public prices for the first 24 hours
-- - direct Supabase RPC callers cannot bypass the cooldown by setting p_market_eligible=true
-- - stored transactions are marked ineligible when they should be excluded from trade-flow signals

create or replace function public.resolve_trade_market_eligibility(
  p_user_id uuid,
  p_requested boolean default true
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_created_at timestamptz;
begin
  if coalesce(p_requested, true) = false then
    return false;
  end if;

  if p_user_id is null then
    return false;
  end if;

  select p.created_at
  into v_created_at
  from public.profiles as p
  where p.id = p_user_id;

  if not found or v_created_at is null then
    return false;
  end if;

  return v_created_at <= now() - interval '24 hours';
end;
$$;

create or replace function public.enforce_transaction_market_eligibility()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.market_eligible := public.resolve_trade_market_eligibility(new.user_id, new.market_eligible);
  return new;
end;
$$;

drop trigger if exists transactions_enforce_market_eligibility on public.transactions;

create trigger transactions_enforce_market_eligibility
before insert or update of user_id, market_eligible on public.transactions
for each row execute function public.enforce_transaction_market_eligibility();

create index if not exists transactions_artist_market_eligible_created_idx
on public.transactions (artist_id, market_eligible, created_at desc);

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
  v_user_id uuid := auth.uid();
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

  if public.resolve_trade_market_eligibility(v_user_id, true) = false then
    return query
    select
      v_artist.id,
      v_artist.ticker,
      v_artist.current_price,
      v_artist.current_price,
      0::numeric,
      ((v_artist.current_price - v_artist.previous_close) / nullif(v_artist.previous_close, 0)) * 100;
    return;
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
      'dailyTradeCapPercent', v_daily_trade_cap * 100,
      'marketEligibility', 'eligible'
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

revoke all on function public.resolve_trade_market_eligibility(uuid, boolean) from public, anon;
revoke execute on function public.resolve_trade_market_eligibility(uuid, boolean) from authenticated;

notify pgrst, 'reload schema';
