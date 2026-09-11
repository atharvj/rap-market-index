begin;

create table if not exists public.product_analytics_events (
  id bigint generated always as identity primary key,
  event_name text not null,
  dedupe_key text not null unique,
  visitor_hash text,
  session_hash text,
  user_id uuid references auth.users(id) on delete set null,
  path text,
  artist_id text references public.artists(id) on delete set null,
  auth_method text,
  action text,
  campaign_source text,
  campaign_medium text,
  campaign_name text,
  referrer_host text,
  occurred_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default clock_timestamp(),
  constraint product_analytics_event_name_check
    check (event_name in (
      'session_start',
      'page_view',
      'artist_view',
      'signup_started',
      'signup_completed',
      'first_trade'
    )),
  constraint product_analytics_dedupe_key_check
    check (dedupe_key ~ '^[a-f0-9]{64}$'),
  constraint product_analytics_visitor_hash_check
    check (visitor_hash is null or visitor_hash ~ '^[a-f0-9]{64}$'),
  constraint product_analytics_session_hash_check
    check (session_hash is null or session_hash ~ '^[a-f0-9]{64}$'),
  constraint product_analytics_path_check
    check (path is null or (char_length(path) between 1 and 240 and path like '/%')),
  constraint product_analytics_auth_method_check
    check (auth_method is null or auth_method in ('email', 'google')),
  constraint product_analytics_action_check
    check (action is null or action in ('buy', 'sell', 'short', 'cover')),
  constraint product_analytics_campaign_source_length_check
    check (campaign_source is null or char_length(campaign_source) between 1 and 80),
  constraint product_analytics_campaign_medium_length_check
    check (campaign_medium is null or char_length(campaign_medium) between 1 and 80),
  constraint product_analytics_campaign_name_length_check
    check (campaign_name is null or char_length(campaign_name) between 1 and 100),
  constraint product_analytics_referrer_host_length_check
    check (referrer_host is null or char_length(referrer_host) between 1 and 160)
);

create unique index if not exists product_analytics_user_milestone_idx
  on public.product_analytics_events (event_name, user_id)
  where user_id is not null and event_name in ('signup_completed', 'first_trade');

create index if not exists product_analytics_occurred_at_idx
  on public.product_analytics_events (occurred_at desc);

create index if not exists product_analytics_event_occurred_at_idx
  on public.product_analytics_events (event_name, occurred_at desc);

create index if not exists product_analytics_user_occurred_at_idx
  on public.product_analytics_events (user_id, occurred_at desc)
  where user_id is not null;

create index if not exists product_analytics_artist_occurred_at_idx
  on public.product_analytics_events (artist_id, occurred_at desc)
  where artist_id is not null;

alter table public.product_analytics_events enable row level security;

-- Product analytics are written through a narrow server route and summarized
-- through an admin-only server route. No browser role can read or write rows.
revoke all on table public.product_analytics_events from public, anon, authenticated;
grant all on table public.product_analytics_events to service_role;

insert into public.product_analytics_events (
  event_name,
  dedupe_key,
  user_id,
  auth_method,
  occurred_at,
  created_at
)
select
  'signup_completed',
  encode(digest('signup_completed:' || profile.id::text, 'sha256'), 'hex'),
  profile.id,
  case
    when coalesce(auth_user.raw_app_meta_data ->> 'provider', '') = 'google' then 'google'
    else 'email'
  end,
  profile.created_at,
  clock_timestamp()
from public.profiles as profile
join auth.users as auth_user on auth_user.id = profile.id
where profile.created_at >= clock_timestamp() - interval '180 days'
on conflict (dedupe_key) do nothing;

insert into public.product_analytics_events (
  event_name,
  dedupe_key,
  user_id,
  artist_id,
  action,
  occurred_at,
  created_at
)
select distinct on (trade.user_id)
  'first_trade',
  encode(digest('first_trade:' || trade.user_id::text, 'sha256'), 'hex'),
  trade.user_id,
  trade.artist_id,
  trade.type,
  trade.created_at,
  clock_timestamp()
from public.market_trade_events as trade
where trade.created_at >= clock_timestamp() - interval '180 days'
  and not exists (
    select 1 from public.market_trade_events as earlier
    where earlier.user_id = trade.user_id and earlier.created_at < trade.created_at
  )
order by trade.user_id, trade.created_at asc, trade.id asc
on conflict (dedupe_key) do nothing;

create or replace function public.get_product_analytics_summary(
  p_days integer default 30
)
returns jsonb
language sql
stable
security definer
set search_path = ''
set timezone = 'UTC'
as $$
  with bounds as (
    select
      greatest(1, least(coalesce(p_days, 30), 180))::integer as days,
      date_trunc('day', clock_timestamp()) - (greatest(1, least(coalesce(p_days, 30), 180)) - 1) * interval '1 day' as starts_at,
      date_trunc('day', clock_timestamp()) + interval '1 day' as ends_at
  ),
  scoped as (
    select event.*
    from public.product_analytics_events as event
    left join public.profiles as profile on profile.id = event.user_id
    cross join bounds
    where not coalesce(profile.is_admin, false)
      and event.occurred_at >= bounds.starts_at
      and event.occurred_at < bounds.ends_at
  ),
  stages as (
    select
      count(distinct visitor_hash) filter (where event_name = 'session_start' and visitor_hash is not null) as visitors,
      count(distinct session_hash) filter (where event_name = 'session_start' and session_hash is not null) as sessions,
      count(distinct visitor_hash) filter (where event_name = 'artist_view' and visitor_hash is not null) as artist_viewers,
      count(distinct visitor_hash) filter (where event_name = 'signup_started' and visitor_hash is not null) as signup_starters,
      count(distinct user_id) filter (where event_name = 'signup_completed' and user_id is not null) as completed_signups,
      count(distinct user_id) filter (where event_name = 'first_trade' and user_id is not null) as first_traders
    from scoped
  ),
  signup_cohort as (
    select user_id, min(occurred_at)::date as signup_date
    from scoped
    where event_name = 'signup_completed' and user_id is not null
    group by user_id
  ),
  retention as (
    select
      count(*) filter (where signup_date < current_date - 1) as d1_eligible_signups,
      count(*) filter (
        where signup_date < current_date - 1
          and exists (
            select 1
            from public.product_analytics_events as session
            where session.user_id = signup.user_id
              and session.event_name = 'session_start'
              and session.occurred_at >= signup.signup_date + interval '1 day'
              and session.occurred_at < signup.signup_date + interval '2 days'
          )
      ) as d1_returning_signups
    from signup_cohort as signup
  ),
  calendar as (
    select generate_series(
      (select starts_at::date from bounds),
      (select (ends_at - interval '1 day')::date from bounds),
      interval '1 day'
    )::date as day
  ),
  daily_values as (
    select
      calendar.day,
      count(distinct scoped.visitor_hash) filter (where scoped.event_name = 'session_start') as visitors,
      count(distinct scoped.user_id) filter (where scoped.event_name = 'signup_completed') as signups,
      count(distinct scoped.user_id) filter (where scoped.event_name = 'first_trade') as first_traders
    from calendar
    left join scoped on scoped.occurred_at::date = calendar.day
    group by calendar.day
    order by calendar.day
  ),
  daily as (
    select coalesce(
      jsonb_agg(jsonb_build_object(
        'date', day,
        'visitors', visitors,
        'signups', signups,
        'firstTraders', first_traders
      ) order by day),
      '[]'::jsonb
    ) as value
    from daily_values
  ),
  top_artist_values as (
    select
      scoped.artist_id,
      coalesce(artist.name, scoped.artist_id) as artist_name,
      coalesce(artist.ticker, upper(scoped.artist_id)) as ticker,
      count(distinct coalesce(scoped.visitor_hash, scoped.user_id::text, scoped.session_hash)) as viewers
    from scoped
    left join public.artists as artist on artist.id = scoped.artist_id
    where scoped.event_name = 'artist_view' and scoped.artist_id is not null
    group by scoped.artist_id, artist.name, artist.ticker
    order by viewers desc, artist_name asc
    limit 10
  ),
  top_artists as (
    select coalesce(
      jsonb_agg(jsonb_build_object(
        'artistId', artist_id,
        'name', artist_name,
        'ticker', ticker,
        'viewers', viewers
      ) order by viewers desc, artist_name asc),
      '[]'::jsonb
    ) as value
    from top_artist_values
  ),
  source_values as (
    select
      coalesce(nullif(campaign_source, ''), nullif(referrer_host, ''), 'direct') as source,
      count(distinct coalesce(visitor_hash, session_hash)) as visitors
    from scoped
    where event_name = 'session_start'
    group by coalesce(nullif(campaign_source, ''), nullif(referrer_host, ''), 'direct')
    order by visitors desc, source asc
    limit 10
  ),
  sources as (
    select coalesce(
      jsonb_agg(jsonb_build_object('source', source, 'visitors', visitors) order by visitors desc, source asc),
      '[]'::jsonb
    ) as value
    from source_values
  ),
  path_values as (
    select path, count(distinct coalesce(visitor_hash, session_hash, user_id::text)) as viewers
    from scoped
    where event_name = 'page_view' and path is not null
    group by path
    order by viewers desc, path asc
    limit 10
  ),
  paths as (
    select coalesce(
      jsonb_agg(jsonb_build_object('path', path, 'viewers', viewers) order by viewers desc, path asc),
      '[]'::jsonb
    ) as value
    from path_values
  )
  select jsonb_build_object(
    'days', bounds.days,
    'startsAt', bounds.starts_at,
    'endsAt', bounds.ends_at,
    'stages', jsonb_build_object(
      'visitors', stages.visitors,
      'sessions', stages.sessions,
      'artistViewers', stages.artist_viewers,
      'signupStarters', stages.signup_starters,
      'completedSignups', stages.completed_signups,
      'firstTraders', stages.first_traders,
      'd1EligibleSignups', retention.d1_eligible_signups,
      'd1ReturningSignups', retention.d1_returning_signups
    ),
    'daily', daily.value,
    'topArtists', top_artists.value,
    'sources', sources.value,
    'topPaths', paths.value
  )
  from bounds, stages, retention, daily, top_artists, sources, paths;
$$;

revoke all on function public.get_product_analytics_summary(integer)
  from public, anon, authenticated;
grant execute on function public.get_product_analytics_summary(integer)
  to service_role;

create or replace function public.prune_product_analytics_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if mod(new.id, 500) = 0 then
    delete from public.product_analytics_events
    where occurred_at < clock_timestamp() - interval '180 days';
  end if;

  return null;
end;
$$;

revoke all on function public.prune_product_analytics_events()
  from public, anon, authenticated;

drop trigger if exists product_analytics_prune_old_rows on public.product_analytics_events;
create trigger product_analytics_prune_old_rows
after insert on public.product_analytics_events
for each row execute function public.prune_product_analytics_events();

notify pgrst, 'reload schema';

commit;
