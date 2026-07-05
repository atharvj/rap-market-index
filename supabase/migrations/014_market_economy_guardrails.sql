-- HSX-style base economy upgrades:
-- - larger starter bankroll for new accounts
-- - 1% trade commission with a two-cent/share minimum
-- - market eligibility flag so admin/test trades can execute without moving public prices

alter table if exists public.profiles
  alter column cash_balance set default 100000;

-- Prelaunch top-up for existing low-balance test profiles after moving from 10k to 100k starter cash.
update public.profiles
set cash_balance = cash_balance + 90000
where cash_balance between 0 and 20000;

create or replace view public.market_leaderboard as
select
  p.id as user_id,
  p.username,
  p.cash_balance + coalesce(sum(h.shares * a.current_price), 0) as portfolio_value,
  p.cash_balance,
  coalesce(sum(h.shares * a.current_price), 0) as holdings_value,
  ((p.cash_balance + coalesce(sum(h.shares * a.current_price), 0) - 100000) / 100000) * 100 as gain_percent
from public.profiles p
left join public.holdings h on h.user_id = p.id
left join public.artists a on a.id = h.artist_id
group by p.id, p.username, p.cash_balance;

alter table if exists public.transactions
  add column if not exists gross_value numeric(14, 2),
  add column if not exists commission numeric(14, 2),
  add column if not exists market_eligible boolean;

update public.transactions
set
  gross_value = coalesce(gross_value, abs(cash_delta)),
  commission = coalesce(commission, 0),
  market_eligible = coalesce(market_eligible, true);

alter table if exists public.transactions
  alter column gross_value set default 0,
  alter column commission set default 0,
  alter column market_eligible set default true,
  alter column gross_value set not null,
  alter column commission set not null,
  alter column market_eligible set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.transactions'::regclass
      and conname = 'transactions_gross_value_nonnegative'
  ) then
    alter table public.transactions
      add constraint transactions_gross_value_nonnegative check (gross_value >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.transactions'::regclass
      and conname = 'transactions_commission_nonnegative'
  ) then
    alter table public.transactions
      add constraint transactions_commission_nonnegative check (commission >= 0);
  end if;
end;
$$;

create index if not exists transactions_market_eligible_created_idx
on public.transactions (market_eligible, created_at desc);

create or replace function public.calculate_trade_commission(
  p_order_value numeric,
  p_shares numeric
)
returns numeric
language sql
immutable
as $$
  select round(greatest(p_order_value * 0.01, p_shares * 0.02, 0.01), 2);
$$;

drop function if exists public.buy_artist_shares(text, numeric);
drop function if exists public.sell_artist_shares(text, numeric);

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
  market_eligible boolean
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

  v_order_value := round(p_shares * v_artist.current_price, 2);

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
    v_artist.current_price,
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
    v_artist.current_price,
    v_order_value,
    v_order_value,
    v_commission,
    v_profile.cash_balance,
    v_total_shares,
    v_average_buy_price,
    v_updated_artist_price,
    v_price_impact_percent,
    v_market_eligible;
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
  market_eligible boolean
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

  v_order_value := round(p_shares * v_artist.current_price, 2);

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
    v_artist.current_price,
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
    v_artist.current_price,
    v_order_value,
    v_order_value,
    v_commission,
    v_profile.cash_balance,
    v_remaining_shares,
    v_average_buy_price,
    v_updated_artist_price,
    v_price_impact_percent,
    v_market_eligible;
end;
$$;

revoke all on function public.calculate_trade_commission(numeric, numeric) from public, anon;
revoke all on function public.buy_artist_shares(text, numeric, boolean) from public, anon;
revoke all on function public.sell_artist_shares(text, numeric, boolean) from public, anon;

grant execute on function public.buy_artist_shares(text, numeric, boolean) to authenticated;
grant execute on function public.sell_artist_shares(text, numeric, boolean) to authenticated;

notify pgrst, 'reload schema';
