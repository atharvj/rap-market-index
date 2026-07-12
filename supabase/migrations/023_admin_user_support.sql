create table if not exists public.admin_action_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  reason text not null default '',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint admin_action_log_action_length check (char_length(action) between 1 and 80),
  constraint admin_action_log_reason_length check (char_length(reason) <= 500)
);

create index if not exists admin_action_log_created_idx
  on public.admin_action_log (created_at desc);

create index if not exists admin_action_log_target_idx
  on public.admin_action_log (target_user_id, created_at desc);

alter table public.admin_action_log enable row level security;

drop policy if exists "Service role manages admin action log" on public.admin_action_log;

create policy "Service role manages admin action log"
on public.admin_action_log for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

revoke all on public.admin_action_log from public, anon, authenticated;
grant all on public.admin_action_log to service_role;

create or replace function public.admin_reset_user_portfolio(
  p_target_user_id uuid,
  p_starting_cash numeric default 100000,
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

notify pgrst, 'reload schema';
