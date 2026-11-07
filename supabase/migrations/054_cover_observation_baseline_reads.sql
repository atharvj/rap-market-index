begin;
-- Baseline readers page numerical observations by source/date/artist/metric.
-- Cover their selected fields so large evidence heap rows are not needed.
set local statement_timeout = '120s';
create index if not exists market_observations_source_date_baseline_idx
  on public.market_observations (source, observed_date desc, artist_id, metric)
  include (value, observed_at);
notify pgrst, 'reload schema';
commit;
