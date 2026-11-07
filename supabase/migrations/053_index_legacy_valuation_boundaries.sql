begin;
-- Most daily snapshots do not contain a correction. Avoid parsing every large
-- historical evidence document on each public chart/snapshot request.
set local statement_timeout = '120s';
create index if not exists market_signal_snapshots_legacy_valuation_idx
  on public.market_signal_snapshots (source_date, artist_id)
  where (raw_payload -> 'audienceRevaluation') is not null;
notify pgrst, 'reload schema';
commit;
