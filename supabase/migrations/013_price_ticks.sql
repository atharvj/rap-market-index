create table if not exists public.price_ticks (
  id uuid primary key default gen_random_uuid(),
  artist_id text not null references public.artists(id) on delete cascade,
  observed_at timestamptz not null default now(),
  price numeric(14, 2) not null,
  source text not null default 'market_run',
  reference_id uuid,
  model_version text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint price_ticks_price_positive check (price > 0),
  constraint price_ticks_source_check check (source in ('market_run', 'trade', 'migration', 'manual'))
);

create index if not exists price_ticks_artist_observed_idx
  on public.price_ticks (artist_id, observed_at desc);

create index if not exists price_ticks_source_observed_idx
  on public.price_ticks (source, observed_at desc);

alter table public.price_ticks enable row level security;

drop policy if exists "Public can read price ticks" on public.price_ticks;
drop policy if exists "Service role manages price ticks" on public.price_ticks;

create policy "Public can read price ticks"
on public.price_ticks for select
using (true);

create policy "Service role manages price ticks"
on public.price_ticks for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

insert into public.price_ticks (
  artist_id,
  observed_at,
  price,
  source,
  raw_payload
)
select
  a.id,
  now(),
  a.current_price,
  'migration',
  jsonb_build_object('source', '013_price_ticks', 'ticker', a.ticker)
from public.artists as a
where a.is_active = true
  and not exists (
    select 1
    from public.price_ticks as existing
    where existing.artist_id = a.id
  );

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
  v_raw_impact numeric;
  v_impact numeric;
  v_updated_price numeric;
  v_trader_demand numeric;
  v_hype_score integer;
  v_current_directional_move numeric;
  v_remaining_directional_cap numeric;
  v_daily_trade_cap numeric := 0.015;
  v_per_order_cap numeric := 0.0035;
  v_liquidity_base numeric := 50000;
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

  v_effective_order_value := least(greatest(p_order_value, 0), 25000);
  v_raw_impact := least(
    power(v_effective_order_value / v_liquidity_base, 0.65) * 0.004 * greatest(v_artist.volatility, 0.5),
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
      'impactPercent', v_impact * 100
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

revoke all on function public.apply_artist_trade_impact(text, numeric, integer) from public;
revoke execute on function public.apply_artist_trade_impact(text, numeric, integer) from anon, authenticated;

notify pgrst, 'reload schema';
