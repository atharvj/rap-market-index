-- A smaller opening bankroll makes portfolio choices meaningful at the current
-- $12-$137 artist quote range while keeping every artist accessible.

alter table if exists public.profiles
  alter column cash_balance set default 25000;

-- Preserve active portfolios. Only normalize prelaunch non-admin accounts that
-- have never placed an order and do not hold a position.
update public.profiles as p
set cash_balance = 25000,
    updated_at = now()
where p.is_admin = false
  and p.cash_balance = 100000
  and not exists (select 1 from public.holdings as h where h.user_id = p.id)
  and not exists (select 1 from public.short_positions as sp where sp.user_id = p.id)
  and not exists (select 1 from public.transactions as t where t.user_id = p.id)
  and not exists (select 1 from public.short_transactions as st where st.user_id = p.id);

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
  ((p.cash_balance + coalesce(lv.holdings_value, 0) + coalesce(sv.short_equity, 0) - 25000) / 25000) * 100 as gain_percent,
  coalesce(sv.short_liability, 0) as short_liability,
  coalesce(sv.short_equity, 0) as short_equity
from public.profiles as p
left join long_values as lv on lv.user_id = p.id
left join short_values as sv on sv.user_id = p.id;

create or replace function public.admin_reset_user_portfolio(
  p_target_user_id uuid,
  p_starting_cash numeric default 25000,
  p_actor_user_id uuid default null,
  p_reason text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_long_positions integer;
  v_short_positions integer;
  v_long_orders integer;
  v_short_orders integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required.';
  end if;

  if p_starting_cash < 0 or p_starting_cash > 100000000 then
    raise exception 'Starting cash must be between 0 and 100,000,000.';
  end if;

  if not exists (select 1 from public.profiles where id = p_target_user_id) then
    raise exception 'Target profile not found.';
  end if;

  select count(*) into v_long_positions from public.holdings where user_id = p_target_user_id;
  select count(*) into v_short_positions from public.short_positions where user_id = p_target_user_id;
  select count(*) into v_long_orders from public.transactions where user_id = p_target_user_id;
  select count(*) into v_short_orders from public.short_transactions where user_id = p_target_user_id;

  delete from public.transactions where user_id = p_target_user_id;
  delete from public.short_transactions where user_id = p_target_user_id;
  delete from public.holdings where user_id = p_target_user_id;
  delete from public.short_positions where user_id = p_target_user_id;

  update public.profiles
  set cash_balance = round(p_starting_cash, 2), updated_at = now()
  where id = p_target_user_id;

  insert into public.admin_action_log (
    actor_user_id,
    target_user_id,
    action,
    reason,
    details
  )
  values (
    p_actor_user_id,
    p_target_user_id,
    'reset_portfolio',
    left(coalesce(p_reason, ''), 500),
    jsonb_build_object(
      'startingCash', round(p_starting_cash, 2),
      'removedLongPositions', v_long_positions,
      'removedShortPositions', v_short_positions,
      'removedLongOrders', v_long_orders,
      'removedShortOrders', v_short_orders
    )
  );

  return jsonb_build_object(
    'targetUserId', p_target_user_id,
    'startingCash', round(p_starting_cash, 2),
    'removedLongPositions', v_long_positions,
    'removedShortPositions', v_short_positions,
    'removedLongOrders', v_long_orders,
    'removedShortOrders', v_short_orders
  );
end;
$$;

revoke all on function public.admin_reset_user_portfolio(uuid, numeric, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_reset_user_portfolio(uuid, numeric, uuid, text) to service_role;
grant select on public.market_leaderboard to anon, authenticated;

notify pgrst, 'reload schema';
