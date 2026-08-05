-- Keep one event per artist and source story, even if a feed changes its
-- timestamp, title suffix, source label, or classification on a later scan.

with ranked_source_events as (
  select
    id,
    row_number() over (
      partition by artist_id, source_url
      order by confidence desc, abs(impact_score) desc, created_at desc, id desc
    ) as source_rank
  from public.market_events
  where source_url is not null
)
delete from public.market_events as event
using ranked_source_events as ranked
where event.id = ranked.id
  and ranked.source_rank > 1;

alter table public.market_events
  drop constraint if exists market_events_artist_source_url_key;

alter table public.market_events
  add constraint market_events_artist_source_url_key unique (artist_id, source_url);

notify pgrst, 'reload schema';
