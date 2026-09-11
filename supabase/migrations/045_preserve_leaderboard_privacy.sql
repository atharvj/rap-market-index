-- Migration 039 recreated the portfolio view and restored an obsolete
-- browser grant. Keep private account values behind the shaped server API.
begin;
revoke all on table public.market_leaderboard from public, anon, authenticated;
grant select on table public.market_leaderboard to service_role;
commit;
