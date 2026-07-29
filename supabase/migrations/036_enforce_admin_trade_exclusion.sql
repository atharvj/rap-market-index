-- Admin and operator activity is useful for testing, but it must never affect
-- live quotes or the daily order-flow signal. Treat is_admin as authoritative
-- even if an exemption flag or server environment drifts out of sync.
update public.profiles
set market_impact_exempt = true
where is_admin = true
  and market_impact_exempt = false;

create or replace function public.enforce_admin_market_impact_exemption()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.is_admin, false) then
    new.market_impact_exempt := true;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_enforce_admin_market_impact_exemption on public.profiles;

create trigger profiles_enforce_admin_market_impact_exemption
before insert or update of is_admin, market_impact_exempt on public.profiles
for each row execute function public.enforce_admin_market_impact_exemption();

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
  v_market_impact_exempt boolean;
  v_is_admin boolean;
begin
  if p_user_id is null then
    return false;
  end if;

  select p.created_at, p.market_impact_exempt, p.is_admin
  into v_created_at, v_market_impact_exempt, v_is_admin
  from public.profiles as p
  where p.id = p_user_id;

  if not found
    or v_created_at is null
    or coalesce(v_market_impact_exempt, false)
    or coalesce(v_is_admin, false) then
    return false;
  end if;

  return v_created_at <= now() - interval '24 hours';
end;
$$;

revoke all on function public.enforce_admin_market_impact_exemption()
from public, anon, authenticated;

revoke all on function public.resolve_trade_market_eligibility(uuid, boolean)
from public, anon, authenticated;

grant execute on function public.resolve_trade_market_eligibility(uuid, boolean)
to service_role;

notify pgrst, 'reload schema';
