-- Reassert the production privilege boundary after all earlier migrations.
-- This migration is intentionally idempotent so it can also repair projects
-- whose grants drifted while the schema was evolving.

begin;

alter table public.artist_external_ids enable row level security;
alter table public.artist_stats enable row level security;
alter table public.market_observations enable row level security;
alter table public.market_events enable row level security;
alter table public.market_signal_snapshots enable row level security;
alter table public.market_update_runs enable row level security;
alter table public.price_ticks enable row level security;
alter table public.market_controls enable row level security;
alter table public.artist_trading_halts enable row level security;
alter table public.admin_action_log enable row level security;
alter table public.api_rate_limits enable row level security;
alter table public.blocked_signup_email_domains enable row level security;
alter table public.profiles enable row level security;
alter table public.holdings enable row level security;
alter table public.transactions enable row level security;
alter table public.watchlist enable row level security;
alter table public.short_positions enable row level security;
alter table public.short_transactions enable row level security;

drop policy if exists "Public can read artist external ids" on public.artist_external_ids;
drop policy if exists "Public can read artist stats" on public.artist_stats;
drop policy if exists "Public can read market observations" on public.market_observations;
drop policy if exists "Public can read market events" on public.market_events;
drop policy if exists "Users can read market update summaries" on public.market_update_runs;
drop policy if exists "Public can read price ticks" on public.price_ticks;
drop policy if exists "Public can read market controls" on public.market_controls;
drop policy if exists "Public can read artist trading halts" on public.artist_trading_halts;

revoke all on table public.artist_external_ids from public, anon, authenticated;
revoke all on table public.artist_stats from public, anon, authenticated;
revoke all on table public.market_observations from public, anon, authenticated;
revoke all on table public.market_events from public, anon, authenticated;
revoke all on table public.market_signal_snapshots from public, anon, authenticated;
revoke all on table public.market_update_runs from public, anon, authenticated;
revoke all on table public.price_ticks from public, anon, authenticated;
revoke all on table public.market_controls from public, anon, authenticated;
revoke all on table public.artist_trading_halts from public, anon, authenticated;
revoke all on table public.admin_action_log from public, anon, authenticated;
revoke all on table public.api_rate_limits from public, anon, authenticated;
revoke all on table public.blocked_signup_email_domains from public, anon, authenticated;

grant all on table public.artist_external_ids to service_role;
grant all on table public.artist_stats to service_role;
grant all on table public.market_observations to service_role;
grant all on table public.market_events to service_role;
grant all on table public.market_signal_snapshots to service_role;
grant all on table public.market_update_runs to service_role;
grant all on table public.price_ticks to service_role;
grant all on table public.market_controls to service_role;
grant all on table public.artist_trading_halts to service_role;
grant all on table public.admin_action_log to service_role;
grant all on table public.api_rate_limits to service_role;
grant select on table public.blocked_signup_email_domains to service_role;
grant select on table public.blocked_signup_email_domains to supabase_auth_admin;

-- These views bypass the API's response shaping and can expose internal market
-- or portfolio data if an old grant survives. Server routes remain the only
-- supported read path.
revoke all on table public.market_leaderboard from public, anon, authenticated;
revoke all on table public.market_trade_events from public, anon, authenticated;
revoke all on table public.short_position_risk from public, anon, authenticated;
grant select on table public.market_leaderboard to service_role;
grant select on table public.market_trade_events to service_role;
grant select on table public.short_position_risk to service_role;

-- Continuous trading removed the old season leaderboard in migration 004.
-- Harden it only when repairing a project where that legacy view still exists.
do $$
begin
  if to_regclass('public.season_leaderboard') is not null then
    execute 'revoke all on table public.season_leaderboard from public, anon, authenticated';
    execute 'grant select on table public.season_leaderboard to service_role';
  end if;
end;
$$;

-- Account state is available only through confirmed-user server routes. RLS
-- remains enabled as defense in depth, but old PostgREST grants must not let a
-- browser bypass response shaping or request-level authorization.
revoke all on table public.profiles from public, anon, authenticated;
revoke all on table public.holdings from public, anon, authenticated;
revoke all on table public.transactions from public, anon, authenticated;
revoke all on table public.watchlist from public, anon, authenticated;
revoke all on table public.short_positions from public, anon, authenticated;
revoke all on table public.short_transactions from public, anon, authenticated;

grant all on table public.profiles to service_role;
grant all on table public.holdings to service_role;
grant all on table public.transactions to service_role;
grant all on table public.watchlist to service_role;
grant all on table public.short_positions to service_role;
grant all on table public.short_transactions to service_role;

-- Internal helpers are callable only through the protected RPCs or server
-- routes that depend on them.
drop function if exists public.buy_artist_shares(text, numeric, uuid);
drop function if exists public.sell_artist_shares(text, numeric, uuid);

revoke all on function public.calculate_hype_score(
  numeric, numeric, numeric, numeric, numeric, numeric
) from public, anon, authenticated;

-- The matching season helper was removed with the legacy leaderboard. Keep
-- this conditional so the hardening migration works on both schema histories.
do $$
begin
  if to_regprocedure('public.get_active_season_id()') is not null then
    execute 'revoke all on function public.get_active_season_id() from public, anon, authenticated';
  end if;
end;
$$;

revoke all on function public.calculate_trade_commission(numeric, numeric)
  from public, anon, authenticated;
revoke all on function public.calculate_artist_market_quote(text, numeric)
  from public, anon, authenticated;
revoke all on function public.set_updated_at()
  from public, anon, authenticated;
revoke all on function public.prevent_long_short_overlap()
  from public, anon, authenticated;
revoke all on function public.apply_artist_trade_impact(text, numeric, integer)
  from public, anon, authenticated;
revoke all on function public.resolve_trade_market_eligibility(uuid, boolean)
  from public, anon, authenticated;
revoke all on function public.enforce_transaction_market_eligibility()
  from public, anon, authenticated;
revoke all on function public.admin_reset_user_portfolio(uuid, numeric, uuid, text)
  from public, anon, authenticated;
revoke all on function public.consume_api_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.hook_reject_disposable_email(jsonb)
  from public, anon, authenticated;
revoke all on function public.buy_artist_shares(text, numeric, boolean)
  from public, anon, authenticated;
revoke all on function public.sell_artist_shares(text, numeric, boolean)
  from public, anon, authenticated;
revoke all on function public.short_artist_shares(text, numeric, boolean)
  from public, anon, authenticated;
revoke all on function public.cover_artist_shares(text, numeric, boolean)
  from public, anon, authenticated;

-- PostgREST cannot safely distinguish an authenticated browser calling a
-- trade RPC directly from the protected application route. Keep the existing
-- functions private and expose one service-role gateway. The server supplies
-- the user id only after validating the caller's confirmed session, rate
-- limit, market status, account age, and pending catalysts.
create or replace function public.execute_artist_trade_as_user(
  p_user_id uuid,
  p_side text,
  p_artist_id text,
  p_shares numeric,
  p_market_eligible boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_trade jsonb;
begin
  if p_user_id is null then
    raise exception 'A verified user is required.';
  end if;

  if p_side not in ('buy', 'sell', 'short', 'cover') then
    raise exception 'Invalid trade side.';
  end if;

  -- The underlying trade functions deliberately derive ownership from
  -- auth.uid(). Set transaction-local JWT claims so they retain that invariant
  -- while the service-only gateway supplies the verified identity.
  perform set_config('request.jwt.claim.sub', p_user_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', p_user_id::text, 'role', 'authenticated')::text,
    true
  );

  case p_side
    when 'buy' then
      select to_jsonb(trade_row)
      into v_trade
      from public.buy_artist_shares(
        p_artist_id,
        p_shares,
        coalesce(p_market_eligible, false)
      ) as trade_row;
    when 'sell' then
      select to_jsonb(trade_row)
      into v_trade
      from public.sell_artist_shares(
        p_artist_id,
        p_shares,
        coalesce(p_market_eligible, false)
      ) as trade_row;
    when 'short' then
      select to_jsonb(trade_row)
      into v_trade
      from public.short_artist_shares(
        p_artist_id,
        p_shares,
        coalesce(p_market_eligible, false)
      ) as trade_row;
    when 'cover' then
      select to_jsonb(trade_row)
      into v_trade
      from public.cover_artist_shares(
        p_artist_id,
        p_shares,
        coalesce(p_market_eligible, false)
      ) as trade_row;
  end case;

  if v_trade is null then
    raise exception 'Trade did not return a result.';
  end if;

  return v_trade;
end;
$$;

revoke all on function public.execute_artist_trade_as_user(
  uuid, text, text, numeric, boolean
) from public, anon, authenticated;

grant execute on function public.resolve_trade_market_eligibility(uuid, boolean)
  to service_role;
grant execute on function public.apply_artist_trade_impact(text, numeric, integer)
  to service_role;
grant execute on function public.admin_reset_user_portfolio(uuid, numeric, uuid, text)
  to service_role;
grant execute on function public.consume_api_rate_limit(text, text, integer, integer)
  to service_role;
grant execute on function public.hook_reject_disposable_email(jsonb)
  to supabase_auth_admin;
grant execute on function public.buy_artist_shares(text, numeric, boolean)
  to service_role;
grant execute on function public.sell_artist_shares(text, numeric, boolean)
  to service_role;
grant execute on function public.short_artist_shares(text, numeric, boolean)
  to service_role;
grant execute on function public.cover_artist_shares(text, numeric, boolean)
  to service_role;
grant execute on function public.execute_artist_trade_as_user(
  uuid, text, text, numeric, boolean
) to service_role;

-- Fail closed for objects created by later migrations. Supabase normally gives
-- API roles broad defaults in public; every future table, sequence, and RPC
-- must now be exposed deliberately in the migration that creates it.
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role;

-- The status RPC is intentionally public: it exposes only whether the virtual
-- market is open, not the underlying controls or pending event records.
revoke all on function public.get_market_trading_status(text) from public, anon, authenticated;
grant execute on function public.get_market_trading_status(text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;
