create table if not exists public.market_events (
  id uuid primary key default gen_random_uuid(),
  artist_id text not null references public.artists(id) on delete cascade,
  event_date date not null,
  event_type text not null,
  title text not null,
  source_name text,
  source_url text,
  sentiment_score numeric(8, 4) not null default 0,
  impact_score numeric(8, 4) not null default 0,
  confidence numeric(5, 4) not null default 0.6500,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint market_events_type_check check (
    event_type in ('release', 'review', 'news', 'controversy', 'award', 'tour', 'viral')
  ),
  constraint market_events_sentiment_range check (sentiment_score between -100 and 100),
  constraint market_events_impact_range check (impact_score between -100 and 100),
  constraint market_events_confidence_range check (confidence between 0 and 1),
  unique (artist_id, event_type, event_date, title)
);

create index if not exists market_events_artist_date_idx
  on public.market_events (artist_id, event_date desc);
create index if not exists market_events_type_date_idx
  on public.market_events (event_type, event_date desc);

alter table public.market_events enable row level security;

drop policy if exists "Public can read market events" on public.market_events;
drop policy if exists "Service role manages market events" on public.market_events;

create policy "Public can read market events"
on public.market_events for select
using (true);

create policy "Service role manages market events"
on public.market_events for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

notify pgrst, 'reload schema';
