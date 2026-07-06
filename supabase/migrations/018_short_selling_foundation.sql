-- Conservative short-selling foundation.
-- This creates backend support for HSX-style short/cover orders without exposing them in the UI yet.
-- Short proceeds are not spendable cash. Users post collateral and realize P/L when covering.

create table if not exists public.short_positions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  artist_id text not null references public.artists(id) on delete cascade,
  shares numeric(18, 6) not null,
  average_short_price numeric(14, 2) not null,
  collateral numeric(14, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, artist_id),
  constraint short_positions_shares_positive check (shares > 0),
  constraint short_positions_avg_price_positive check (average_short_price > 0),
  constraint short_positions_collateral_nonnegative check (collateral >= 0)
);

create table if not exists public.short_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  artist_id text not null references public.artists(id) on delete restrict,
  type text not null check (type in ('short', 'cover')),
  shares numeric(18, 6) not null,
  price numeric(14, 2) not null,
  cash_delta numeric(14, 2) not null,
  gross_value numeric(14, 2) not null default 0,
  commission numeric(14, 2) not null default 0,
  collateral_delta numeric(14, 2) not null default 0,
  realized_pnl numeric(14, 2) not null default 0,
  market_eligible boolean not null default true,
  created_at timestamptz not null default now(),
  constraint short_transactions_shares_positive check (shares > 0),
  constraint short_transactions_price_positive check (price > 0),
  constraint short_transactions_gross_value_nonnegative check (gross_value >= 0),
  constraint short_transactions_commission_nonnegative check (commission >= 0)
);

create index if not exists short_transactions_user_created_idx
on public.short_transactions (user_id, created_at desc);

create index if not exists short_transactions_artist_market_eligible_created_idx
on public.short_transactions (artist_id, market_eligible, created_at desc);

alter table public.short_positions enable row level security;
alter table public.short_transactions enable row level security;

drop policy if exists "Users can read own short positions" on public.short_positions;
drop policy if exists "Service role manages short positions" on public.short_positions;
drop policy if exists "Users can read own short transactions" on public.short_transactions;
drop policy if exists "Service role manages short transactions" on public.short_transactions;

create policy "Users can read own short positions"
on public.short_positions for select
using (auth.uid() = user_id);

create policy "Service role manages short positions"
on public.short_positions for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create policy "Users can read own short transactions"
on public.short_transactions for select
using (auth.uid() = user_id);

create policy "Service role manages short transactions"
on public.short_transactions for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop trigger if exists short_positions_set_updated_at on public.short_positions;
create trigger short_positions_set_updated_at
before update on public.short_positions
for each row execute function public.set_updated_at();

create or replace function public.prevent_long_short_overlap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.short_positions as sp
    where sp.user_id = new.user_id
      and sp.artist_id = new.artist_id
      and sp.shares > 0
  ) then
    raise exception 'Cover the short position before buying long shares.';
  end if;

  return new;
end;
$$;

drop trigger if exists holdings_prevent_long_short_overlap on public.holdings;
create trigger holdings_prevent_long_short_overlap
before insert or update of user_id, artist_id, shares on public.holdings
for each row execute function public.prevent_long_short_overlap();

create or replace view public.market_trade_events
with (security_invoker = true) as
select
  t.id,
  t.user_id,
  t.artist_id,
  t.type::text as type,
  t.shares,
  t.price,
  t.cash_delta,
  t.gross_value,
  t.commission,
  0::numeric(14, 2) as collateral_delta,
  0::numeric(14, 2) as realized_pnl,
  t.market_eligible,
  t.created_at,
  'long'::text as position_kind
from public.transactions as t
union all
select
  st.id,
  st.user_id,
  st.artist_id,
  st.type,
  st.shares,
  st.price,
  st.cash_delta,
  st.gross_value,
  st.commission,
  st.collateral_delta,
  st.realized_pnl,
  st.market_eligible,
  st.created_at,
  'short'::text as position_kind
from public.short_transactions as st;

create or replace view public.short_position_risk
with (security_invoker = true) as
select
  sp.user_id,
  sp.artist_id,
  a.ticker,
  a.name,
  sp.shares,
  sp.average_short_price,
  sp.collateral,
  a.current_price,
  round(sp.shares * a.current_price, 2) as current_liability,
  round((sp.average_short_price - a.current_price) * sp.shares, 2) as unrealized_pnl,
  round(sp.collateral + (sp.average_short_price - a.current_price) * sp.shares, 2) as short_equity,
  case
    when sp.shares * a.current_price > 0 then
      round((sp.collateral + (sp.average_short_price - a.current_price) * sp.shares) / (sp.shares * a.current_price) * 100, 4)
    else 0
  end as equity_percent,
  sp.updated_at
from public.short_positions as sp
join public.artists as a on a.id = sp.artist_id;

create or replace view public.market_leaderboard as
with long_values as (
  select
    h.user_id,
    coalesce(sum(h.shares * a.current_price), 0) as holdings_value
  from public.holdings as h
  join public.artists as a on a.id = h.artist_id
  group by h.user_id
),
short_values as (
  select
    sp.user_id,
    coalesce(sum(sp.shares * a.current_price), 0) as short_liability,
    coalesce(sum(sp.collateral + (sp.average_short_price - a.current_price) * sp.shares), 0) as short_equity
  from public.short_positions as sp
  join public.artists as a on a.id = sp.artist_id
  group by sp.user_id
)
select
  p.id as user_id,
  p.username,
  p.cash_balance + coalesce(lv.holdings_value, 0) + coalesce(sv.short_equity, 0) as portfolio_value,
  p.cash_balance,
  coalesce(lv.holdings_value, 0) as holdings_value,
  ((p.cash_balance + coalesce(lv.holdings_value, 0) + coalesce(sv.short_equity, 0) - 100000) / 100000) * 100 as gain_percent,
  coalesce(sv.short_liability, 0) as short_liability,
  coalesce(sv.short_equity, 0) as short_equity
from public.profiles as p
left join long_values as lv on lv.user_id = p.id
left join short_values as sv on sv.user_id = p.id;

grant select on public.market_trade_events to authenticated;
grant select on public.short_position_risk to authenticated;
grant select on public.short_positions to authenticated;
grant select on public.short_transactions to authenticated;
grant select on public.market_leaderboard to anon, authenticated;

drop trigger if exists short_transactions_enforce_market_eligibility on public.short_transactions;

create trigger short_transactions_enforce_market_eligibility
before insert or update of user_id, artist_id, market_eligible on public.short_transactions
for each row execute function public.enforce_transaction_market_eligibility();

create or replace function public.short_artist_shares(
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
  collateral_required numeric,
  cash_balance numeric,
  short_shares numeric,
  average_short_price numeric,
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
  v_position public.short_positions%rowtype;
  v_has_position boolean := false;
  v_quote record;
  v_status record;
  v_transaction_id uuid;
  v_execution_price numeric;
  v_order_value numeric;
  v_commission numeric;
  v_collateral_required numeric;
  v_total_debit numeric;
  v_total_shares numeric;
  v_average_short_price numeric;
  v_total_collateral numeric;
  v_impact record;
  v_updated_artist_price numeric;
  v_price_impact_percent numeric := 0;
  v_holdings_value numeric := 0;
  v_short_equity numeric := 0;
  v_short_liability numeric := 0;
  v_existing_short_liability numeric := 0;
  v_portfolio_value numeric := 0;
  v_max_position_value numeric := 0;
  v_recent_artist_short_value numeric := 0;
  v_daily_artist_short_limit numeric := 0;
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
  into v_status
  from public.get_market_trading_status(p_artist_id);

  if coalesce(v_status.market_open, false) = false then
    raise exception '%', coalesce(v_status.reason, 'Trading is currently paused.');
  end if;

  if exists (
    select 1
    from public.holdings as h
    where h.user_id = v_user_id
      and h.artist_id = p_artist_id
      and h.shares > 0
  ) then
    raise exception 'Sell long shares before shorting this artist.';
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
  v_collateral_required := round(v_order_value * 0.5, 2);
  v_total_debit := v_collateral_required + v_commission;

  if v_profile.cash_balance < v_total_debit then
    raise exception 'Not enough cash for this short order collateral and commission.';
  end if;

  select sp.*
  into v_position
  from public.short_positions as sp
  where sp.user_id = v_user_id
    and sp.artist_id = p_artist_id
  for update;

  v_has_position := found;

  select coalesce(sum(h.shares * a.current_price), 0)
  into v_holdings_value
  from public.holdings as h
  join public.artists as a on a.id = h.artist_id
  where h.user_id = v_user_id;

  select
    coalesce(sum(sp.shares * a.current_price), 0),
    coalesce(sum(sp.collateral + (sp.average_short_price - a.current_price) * sp.shares), 0)
  into v_short_liability, v_short_equity
  from public.short_positions as sp
  join public.artists as a on a.id = sp.artist_id
  where sp.user_id = v_user_id;

  v_portfolio_value := v_profile.cash_balance + v_holdings_value + v_short_equity;
  v_existing_short_liability := coalesce(v_position.shares, 0) * v_artist.current_price;
  v_max_position_value := greatest(100, v_portfolio_value * 0.25);

  if v_existing_short_liability + v_order_value > v_max_position_value then
    raise exception 'Artist short exposure limit is 25%% of portfolio value.';
  end if;

  select count(*)
  into v_recent_same_artist_trade_count
  from public.market_trade_events as t
  where t.user_id = v_user_id
    and t.artist_id = p_artist_id
    and t.created_at >= now() - interval '30 seconds';

  if v_recent_same_artist_trade_count > 0 then
    raise exception 'Please wait before placing another order for this artist.';
  end if;

  select coalesce(sum(t.gross_value), 0)
  into v_recent_artist_short_value
  from public.short_transactions as t
  where t.user_id = v_user_id
    and t.artist_id = p_artist_id
    and t.type = 'short'
    and t.created_at >= now() - interval '24 hours';

  v_daily_artist_short_limit := greatest(1000, least(5000, v_portfolio_value * 0.4));

  if v_recent_artist_short_value + v_order_value > v_daily_artist_short_limit then
    raise exception 'Daily short limit reached for this artist. Try again later.';
  end if;

  if v_has_position then
    v_total_shares := v_position.shares + p_shares;
    v_average_short_price := round(
      ((v_position.average_short_price * v_position.shares) + v_order_value) / v_total_shares,
      2
    );
    v_total_collateral := v_position.collateral + v_collateral_required;

    update public.short_positions as sp
    set
      shares = v_total_shares,
      average_short_price = v_average_short_price,
      collateral = v_total_collateral
    where sp.user_id = v_user_id
      and sp.artist_id = p_artist_id;
  else
    v_total_shares := p_shares;
    v_average_short_price := v_execution_price;
    v_total_collateral := v_collateral_required;

    insert into public.short_positions (
      user_id,
      artist_id,
      shares,
      average_short_price,
      collateral
    )
    values (
      v_user_id,
      p_artist_id,
      v_total_shares,
      v_average_short_price,
      v_total_collateral
    );
  end if;

  update public.profiles as p
  set cash_balance = p.cash_balance - v_total_debit
  where p.id = v_user_id
  returning * into v_profile;

  v_market_eligible := public.resolve_trade_market_eligibility(v_user_id, v_market_eligible)
    and coalesce(v_status.market_impact_enabled, true);

  insert into public.short_transactions (
    user_id,
    artist_id,
    type,
    shares,
    price,
    cash_delta,
    gross_value,
    commission,
    collateral_delta,
    realized_pnl,
    market_eligible
  )
  values (
    v_user_id,
    p_artist_id,
    'short',
    p_shares,
    v_execution_price,
    -v_total_debit,
    v_order_value,
    v_commission,
    v_collateral_required,
    0,
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
    v_collateral_required,
    v_profile.cash_balance,
    v_total_shares,
    v_average_short_price,
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

create or replace function public.cover_artist_shares(
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
  collateral_released numeric,
  realized_pnl numeric,
  cash_balance numeric,
  short_shares numeric,
  average_short_price numeric,
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
  v_position public.short_positions%rowtype;
  v_quote record;
  v_status record;
  v_transaction_id uuid;
  v_execution_price numeric;
  v_order_value numeric;
  v_commission numeric;
  v_collateral_released numeric;
  v_realized_pnl numeric;
  v_cash_delta numeric;
  v_remaining_shares numeric;
  v_remaining_collateral numeric;
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
  into v_status
  from public.get_market_trading_status(p_artist_id);

  if coalesce(v_status.market_open, false) = false then
    raise exception '%', coalesce(v_status.reason, 'Trading is currently paused.');
  end if;

  select sp.*
  into v_position
  from public.short_positions as sp
  where sp.user_id = v_user_id
    and sp.artist_id = p_artist_id
  for update;

  if not found or v_position.shares < p_shares then
    raise exception 'You cannot cover more shares than you are short.';
  end if;

  select count(*)
  into v_recent_same_artist_trade_count
  from public.market_trade_events as t
  where t.user_id = v_user_id
    and t.artist_id = p_artist_id
    and t.created_at >= now() - interval '30 seconds';

  if v_recent_same_artist_trade_count > 0 then
    raise exception 'Please wait before placing another order for this artist.';
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
  v_collateral_released := round(v_position.collateral * (p_shares / v_position.shares), 2);
  v_realized_pnl := round((v_position.average_short_price - v_execution_price) * p_shares, 2);
  v_cash_delta := v_collateral_released + v_realized_pnl - v_commission;

  if v_profile.cash_balance + v_cash_delta < 0 then
    raise exception 'Not enough cash to cover this losing short position.';
  end if;

  v_remaining_shares := v_position.shares - p_shares;
  v_remaining_collateral := v_position.collateral - v_collateral_released;

  if v_remaining_shares <= 0.000001 then
    delete from public.short_positions as sp
    where sp.user_id = v_user_id
      and sp.artist_id = p_artist_id;

    v_remaining_shares := 0;
    v_remaining_collateral := 0;
  else
    update public.short_positions as sp
    set
      shares = v_remaining_shares,
      collateral = v_remaining_collateral
    where sp.user_id = v_user_id
      and sp.artist_id = p_artist_id;
  end if;

  update public.profiles as p
  set cash_balance = p.cash_balance + v_cash_delta
  where p.id = v_user_id
  returning * into v_profile;

  v_market_eligible := public.resolve_trade_market_eligibility(v_user_id, v_market_eligible)
    and coalesce(v_status.market_impact_enabled, true);

  insert into public.short_transactions (
    user_id,
    artist_id,
    type,
    shares,
    price,
    cash_delta,
    gross_value,
    commission,
    collateral_delta,
    realized_pnl,
    market_eligible
  )
  values (
    v_user_id,
    p_artist_id,
    'cover',
    p_shares,
    v_execution_price,
    v_cash_delta,
    v_order_value,
    v_commission,
    -v_collateral_released,
    v_realized_pnl,
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
    v_collateral_released,
    v_realized_pnl,
    v_profile.cash_balance,
    v_remaining_shares,
    case when v_remaining_shares > 0 then v_position.average_short_price else 0 end,
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

revoke all on function public.short_artist_shares(text, numeric, boolean) from public, anon;
revoke all on function public.cover_artist_shares(text, numeric, boolean) from public, anon;

grant execute on function public.short_artist_shares(text, numeric, boolean) to authenticated;
grant execute on function public.cover_artist_shares(text, numeric, boolean) to authenticated;

notify pgrst, 'reload schema';
