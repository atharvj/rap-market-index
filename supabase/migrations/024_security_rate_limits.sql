create table if not exists public.api_rate_limits (
  scope text not null,
  key_hash text not null,
  window_started_at timestamptz not null default clock_timestamp(),
  request_count integer not null default 0,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (scope, key_hash),
  constraint api_rate_limits_scope_length check (char_length(scope) between 1 and 64),
  constraint api_rate_limits_key_hash_format check (key_hash ~ '^[a-f0-9]{64}$'),
  constraint api_rate_limits_request_count_nonnegative check (request_count >= 0)
);

create index if not exists api_rate_limits_updated_at_idx
  on public.api_rate_limits (updated_at);

-- These cover the two read paths that run before every trade. They keep those
-- checks indexed as quote and event history grows.
create index if not exists market_events_pending_catalyst_idx
  on public.market_events (artist_id, created_at desc)
  where confidence >= 0.65 and abs(impact_score) >= 35;

create index if not exists price_ticks_artist_source_observed_idx
  on public.price_ticks (artist_id, source, observed_at desc);

alter table public.api_rate_limits enable row level security;

revoke all on table public.api_rate_limits from public, anon, authenticated;
grant all on table public.api_rate_limits to service_role;

create or replace function public.consume_api_rate_limit(
  p_key_hash text,
  p_scope text,
  p_limit integer,
  p_window_seconds integer
)
returns table (
  allowed boolean,
  remaining integer,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_row public.api_rate_limits%rowtype;
  v_reset_at timestamptz;
begin
  if p_key_hash !~ '^[a-f0-9]{64}$'
    or char_length(p_scope) not between 1 and 64
    or p_limit not between 1 and 10000
    or p_window_seconds not between 1 and 86400 then
    raise exception 'Invalid rate limit parameters.';
  end if;

  insert into public.api_rate_limits as limits (
    scope,
    key_hash,
    window_started_at,
    request_count,
    updated_at
  )
  values (
    p_scope,
    p_key_hash,
    v_now,
    1,
    v_now
  )
  on conflict (scope, key_hash) do update
  set
    window_started_at = case
      when limits.window_started_at + make_interval(secs => p_window_seconds) <= v_now then v_now
      else limits.window_started_at
    end,
    request_count = case
      when limits.window_started_at + make_interval(secs => p_window_seconds) <= v_now then 1
      else limits.request_count + 1
    end,
    updated_at = v_now
  returning * into v_row;

  v_reset_at := v_row.window_started_at + make_interval(secs => p_window_seconds);

  if random() < 0.01 then
    delete from public.api_rate_limits
    where updated_at < v_now - interval '2 days';
  end if;

  return query
  select
    v_row.request_count <= p_limit,
    greatest(0, p_limit - v_row.request_count),
    greatest(1, ceil(extract(epoch from (v_reset_at - v_now)))::integer);
end;
$$;

revoke all on function public.consume_api_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_api_rate_limit(text, text, integer, integer)
  to service_role;

notify pgrst, 'reload schema';
