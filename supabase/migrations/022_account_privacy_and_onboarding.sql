alter table if exists public.profiles
  add column if not exists profile_is_public boolean not null default true,
  add column if not exists portfolio_is_public boolean not null default true,
  add column if not exists favorite_genres text[] not null default '{}',
  add column if not exists onboarding_completed boolean not null default true,
  add column if not exists market_impact_exempt boolean not null default false,
  add column if not exists is_admin boolean not null default false;

-- Existing traders should not be forced through first-run onboarding. New
-- profiles created after this migration start incomplete until step four.
alter table if exists public.profiles
  alter column onboarding_completed set default false;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_favorite_genres_limit'
  ) then
    alter table public.profiles
      add constraint profiles_favorite_genres_limit
      check (cardinality(favorite_genres) <= 8);
  end if;
end $$;

-- Keep raw provider payloads and internal run diagnostics behind server-only
-- endpoints. Public pages receive curated observations and market news instead.
drop policy if exists "Public can read artist external ids" on public.artist_external_ids;
drop policy if exists "Public can read market observations" on public.market_observations;
drop policy if exists "Public can read market events" on public.market_events;
drop policy if exists "Users can read market update summaries" on public.market_update_runs;
drop policy if exists "Public can read price ticks" on public.price_ticks;
drop policy if exists "Public can read artist stats" on public.artist_stats;

revoke select on public.artist_external_ids from anon, authenticated;
revoke select on public.market_observations from anon, authenticated;
revoke select on public.market_events from anon, authenticated;
revoke select on public.market_update_runs from anon, authenticated;
revoke select on public.price_ticks from anon, authenticated;
revoke select on public.market_leaderboard from anon, authenticated;
revoke select on public.market_trade_events from anon, authenticated;
revoke select on public.short_position_risk from anon, authenticated;
revoke select on public.artist_stats from anon, authenticated;

-- Owning a profile row must not imply direct control over its fantasy balance
-- or public fields. Confirmed-user server routes validate profile writes.
revoke insert, update, delete on public.profiles from anon;
revoke insert, update, delete on public.profiles from authenticated;

drop policy if exists "Users upload their own profile avatar" on storage.objects;
drop policy if exists "Users update their own profile avatar" on storage.objects;
drop policy if exists "Users delete their own profile avatar" on storage.objects;

-- Eligibility is resolved inside the database so direct RPC callers cannot
-- opt out of order-flow accounting or make an exempt admin order move quotes.
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
begin
  if p_user_id is null then
    return false;
  end if;

  select p.created_at, p.market_impact_exempt
  into v_created_at, v_market_impact_exempt
  from public.profiles as p
  where p.id = p_user_id;

  if not found or v_created_at is null or coalesce(v_market_impact_exempt, false) then
    return false;
  end if;

  return v_created_at <= now() - interval '24 hours';
end;
$$;

revoke all on function public.resolve_trade_market_eligibility(uuid, boolean) from public, anon;
revoke execute on function public.resolve_trade_market_eligibility(uuid, boolean) from authenticated;
grant execute on function public.resolve_trade_market_eligibility(uuid, boolean) to service_role;

-- Treat email confirmation and onboarding as trading invariants, not UI rules.
-- A rejected trigger aborts the surrounding buy/sell/short/cover transaction,
-- including any profile or holding changes made earlier in the RPC.
create or replace function public.enforce_transaction_market_eligibility()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status record;
  v_email_confirmed_at timestamptz;
  v_onboarding_completed boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    if auth.uid() is null or auth.uid() <> new.user_id then
      raise exception 'Authenticated user does not match the trade account.';
    end if;

    select u.email_confirmed_at
    into v_email_confirmed_at
    from auth.users as u
    where u.id = auth.uid();

    if v_email_confirmed_at is null then
      raise exception 'Confirm your email before trading.';
    end if;

    select p.onboarding_completed
    into v_onboarding_completed
    from public.profiles as p
    where p.id = auth.uid();

    if coalesce(v_onboarding_completed, false) = false then
      raise exception 'Complete account setup before trading.';
    end if;
  end if;

  select *
  into v_status
  from public.get_market_trading_status(new.artist_id);

  if coalesce(v_status.market_open, false) = false then
    raise exception '%', coalesce(v_status.reason, 'Trading is currently paused.');
  end if;

  new.market_eligible := public.resolve_trade_market_eligibility(new.user_id, true)
    and coalesce(v_status.market_impact_enabled, true);
  return new;
end;
$$;

revoke all on function public.enforce_transaction_market_eligibility() from public, anon, authenticated;

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
  v_pending_event_title text;
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
    elsif v_market_open then
      select e.title
      into v_pending_event_title
      from public.market_events as e
      where e.artist_id = p_artist_id
        and e.confidence >= 0.65
        and abs(e.impact_score) >= 35
        and e.created_at > coalesce(
          (
            select max(pt.observed_at)
            from public.price_ticks as pt
            where pt.artist_id = p_artist_id
              and pt.source = 'market_run'
          ),
          '-infinity'::timestamptz
        )
      order by e.created_at desc
      limit 1;

      if found then
        v_market_open := false;
        v_impact_enabled := false;
        v_reason := 'Trading is temporarily paused while a newly detected catalyst is incorporated into the quote.';
      end if;
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

notify pgrst, 'reload schema';
