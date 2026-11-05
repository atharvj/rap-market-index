begin;

-- Read only the most recent prior snapshot for each requested artist. Fetching
-- 1,000 historical JSON documents became too expensive as evidence accumulated.
create function public.get_previous_market_signals(p_artist_ids text[], p_before_date date)
returns table (
  artist_id text, source_date date, streaming_growth numeric, youtube_growth numeric,
  search_growth numeric, social_growth numeric, news_score numeric, trader_demand numeric,
  event_pricing jsonb, source_values jsonb, reception_pricing jsonb, comment_reception jsonb
)
language sql stable security invoker set search_path = ''
as $$
  select s.artist_id, s.source_date, s.streaming_growth, s.youtube_growth,
    s.search_growth, s.social_growth, s.news_score, s.trader_demand,
    s.raw_payload->'market_events', s.raw_payload->'sourceValues',
    s.raw_payload->'receptionPricingBaseline', s.raw_payload->'youtube_comments'
  from (select distinct unnest(p_artist_ids) as id) requested
  cross join lateral (
    select snapshot.* from public.market_signal_snapshots snapshot
    where snapshot.artist_id = requested.id and snapshot.source_date < p_before_date
    order by snapshot.source_date desc limit 1
  ) s
  order by s.artist_id;
$$;

revoke all on function public.get_previous_market_signals(text[], date) from public, anon, authenticated;
grant execute on function public.get_previous_market_signals(text[], date) to service_role;
notify pgrst, 'reload schema';
commit;
