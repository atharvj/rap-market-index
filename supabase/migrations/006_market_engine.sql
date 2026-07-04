create table if not exists public.artist_external_ids (
  artist_id text primary key references public.artists(id) on delete cascade,
  spotify_id text,
  youtube_channel_id text,
  musicbrainz_id text,
  lastfm_name text,
  gdelt_query text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.market_observations (
  id uuid primary key default gen_random_uuid(),
  artist_id text not null references public.artists(id) on delete cascade,
  source text not null,
  metric text not null,
  observed_date date not null,
  observed_at timestamptz not null default now(),
  value numeric(18, 6) not null,
  unit text not null default 'count',
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (artist_id, source, metric, observed_date)
);

create index if not exists artist_external_ids_gdelt_idx on public.artist_external_ids (gdelt_query);
create index if not exists market_observations_artist_source_date_idx
  on public.market_observations (artist_id, source, observed_date desc);
create index if not exists market_observations_metric_date_idx
  on public.market_observations (source, metric, observed_date desc);

drop trigger if exists artist_external_ids_set_updated_at on public.artist_external_ids;
create trigger artist_external_ids_set_updated_at
before update on public.artist_external_ids
for each row execute function public.set_updated_at();

alter table public.artist_external_ids enable row level security;
alter table public.market_observations enable row level security;

drop policy if exists "Public can read artist external ids" on public.artist_external_ids;
drop policy if exists "Public can read market observations" on public.market_observations;
drop policy if exists "Service role manages artist external ids" on public.artist_external_ids;
drop policy if exists "Service role manages market observations" on public.market_observations;

create policy "Public can read artist external ids"
on public.artist_external_ids for select
using (true);

create policy "Public can read market observations"
on public.market_observations for select
using (true);

create policy "Service role manages artist external ids"
on public.artist_external_ids for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create policy "Service role manages market observations"
on public.market_observations for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

insert into public.artist_external_ids (
  artist_id,
  lastfm_name,
  gdelt_query
)
values
  ('playboi-carti', 'Playboi Carti', '"Playboi Carti" rapper OR "Playboi Carti" music'),
  ('drake', 'Drake', '"Drake" rapper OR "Drake" music'),
  ('future', 'Future', '"Future" rapper OR "Future" music'),
  ('che', 'Che', '"Che" rapper music'),
  ('osamason', 'Osamason', '"Osamason" rapper OR "Osamason" music'),
  ('yung-fazo', 'Yung Fazo', '"Yung Fazo" rapper OR "Yung Fazo" music'),
  ('yeat', 'Yeat', '"Yeat" rapper OR "Yeat" music'),
  ('ken-carson', 'Ken Carson', '"Ken Carson" rapper OR "Ken Carson" music'),
  ('bleood', 'Bleood', '"Bleood" rapper OR "Bleood" music'),
  ('eminem', 'Eminem', '"Eminem" rapper OR "Eminem" music')
on conflict (artist_id) do update set
  lastfm_name = coalesce(public.artist_external_ids.lastfm_name, excluded.lastfm_name),
  gdelt_query = coalesce(public.artist_external_ids.gdelt_query, excluded.gdelt_query);

notify pgrst, 'reload schema';
