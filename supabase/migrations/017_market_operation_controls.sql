-- HSX-style market operations controls:
-- - the market can run as a continuous virtual specialist market
-- - admins can pause all trading, pause market impact, or halt one artist
-- - trades remain guaranteed while open, but bad data can be isolated before it moves prices

create table if not exists public.market_controls (
  id boolean primary key default true,
  trading_mode text not null default 'continuous',
  allow_trading boolean not null default true,
  allow_market_impact boolean not null default true,
  status_note text not null default 'Continuous virtual trading is open.',
  day_change_reset text not null default '12:01 AM PT',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint market_controls_singleton check (id = true),
  constraint market_controls_mode_check check (trading_mode in ('continuous', 'halted', 'maintenance'))
);

insert into public.market_controls (id)
values (true)
on conflict (id) do nothing;

create table if not exists public.artist_trading_halts (
  artist_id text primary key references public.artists(id) on delete cascade,
  is_halted boolean not null default true,
  reason text not null default 'Trading halted for review.',
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint artist_halts_date_order check (ends_at is null or ends_at > starts_at)
);

create index if not exists artist_trading_halts_active_idx
on public.artist_trading_halts (is_halted, starts_at, ends_at);

alter table public.market_controls enable row level security;
alter table public.artist_trading_halts enable row level security;

drop policy if exists "Public can read market controls" on public.market_controls;
drop policy if exists "Service role manages market controls" on public.market_controls;
drop policy if exists "Public can read artist trading halts" on public.artist_trading_halts;
drop policy if exists "Service role manages artist trading halts" on public.artist_trading_halts;

create policy "Public can read market controls"
on public.market_controls for select
using (true);

create policy "Service role manages market controls"
on public.market_controls for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create policy "Public can read artist trading halts"
on public.artist_trading_halts for select
using (true);

create policy "Service role manages artist trading halts"
on public.artist_trading_halts for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop trigger if exists market_controls_set_updated_at on public.market_controls;
create trigger market_controls_set_updated_at
before update on public.market_controls
for each row execute function public.set_updated_at();

drop trigger if exists artist_trading_halts_set_updated_at on public.artist_trading_halts;
create trigger artist_trading_halts_set_updated_at
before update on public.artist_trading_halts
for each row execute function public.set_updated_at();

create or replace function public.get_market_trading_status(
  p_artist_id text default null
)
returns table (
  trading_mode text,
  market_open boolean,
  market_impact_enabled boolean,
  artist_halted boolean,
  reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_control public.market_controls%rowtype;
  v_halt public.artist_trading_halts%rowtype;
  v_market_open boolean;
  v_impact_enabled boolean;
  v_artist_halted boolean := false;
  v_reason text;
begin
  select mc.*
  into v_control
  from public.market_controls as mc
  where mc.id = true;

  if not found then
    v_control.trading_mode := 'continuous';
    v_control.allow_trading := true;
    v_control.allow_market_impact := true;
    v_control.status_note := 'Continuous virtual trading is open.';
  end if;

  v_market_open := v_control.trading_mode = 'continuous' and v_control.allow_trading = true;
  v_impact_enabled := v_market_open and v_control.allow_market_impact = true;
  v_reason := v_control.status_note;

  if not v_market_open then
    v_reason := coalesce(nullif(v_control.status_note, ''), 'Trading is currently paused.');
  end if;

  if p_artist_id is not null then
    select h.*
    into v_halt
    from public.artist_trading_halts as h
    where h.artist_id = p_artist_id
      and h.is_halted = true
      and h.starts_at <= now()
      and (h.ends_at is null or h.ends_at > now());

    if found then
      v_artist_halted := true;
      v_market_open := false;
      v_impact_enabled := false;
      v_reason := coalesce(nullif(v_halt.reason, ''), 'Trading is halted for this artist.');
    end if;
  end if;

  return query
  select
    coalesce(v_control.trading_mode, 'continuous'),
    v_market_open,
    v_impact_enabled,
    v_artist_halted,
    v_reason;
end;
$$;

create or replace function public.enforce_transaction_market_eligibility()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status record;
begin
  select *
  into v_status
  from public.get_market_trading_status(new.artist_id);

  if coalesce(v_status.market_open, false) = false then
    raise exception '%', coalesce(v_status.reason, 'Trading is currently paused.');
  end if;

  new.market_eligible := public.resolve_trade_market_eligibility(new.user_id, new.market_eligible)
    and coalesce(v_status.market_impact_enabled, true);
  return new;
end;
$$;

drop trigger if exists transactions_enforce_market_eligibility on public.transactions;

create trigger transactions_enforce_market_eligibility
before insert or update of user_id, artist_id, market_eligible on public.transactions
for each row execute function public.enforce_transaction_market_eligibility();

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
  v_status record;
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

  select *
  into v_status
  from public.get_market_trading_status(p_artist_id);

  if coalesce(v_status.market_open, false) = false then
    raise exception '%', coalesce(v_status.reason, 'Trading is currently paused.');
  end if;

  if coalesce(v_status.market_impact_enabled, true) = false
    or public.resolve_trade_market_eligibility(v_user_id, true) = false then
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
      'marketEligibility', 'eligible',
      'marketMode', coalesce(v_status.trading_mode, 'continuous')
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

revoke all on function public.get_market_trading_status(text) from public;
grant execute on function public.get_market_trading_status(text) to anon, authenticated;
revoke all on function public.apply_artist_trade_impact(text, numeric, integer) from public, anon, authenticated;

notify pgrst, 'reload schema';
