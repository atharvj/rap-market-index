-- Add only artists that passed the August 26, 2026 cross-source listing gate:
-- exact official YouTube channel, exact MusicBrainz identity, a matching
-- MusicBrainz-linked Last.fm record, an unambiguous Wikipedia article, and
-- recent public activity. Opening prices use the shared YouTube audience-scale
-- formula; momentum starts neutral because no historical movement is invented.
insert into public.artists (
  id,
  name,
  ticker,
  current_price,
  previous_close,
  daily_change_percent,
  hype_score,
  volatility,
  category,
  accent,
  last_move_explanation,
  is_active
)
values
  ('polo-g', 'Polo G', 'POLO', 85.58, 85.58, 0, 50, 1.150, 'mainstream', 'from-fuchsia-300 via-lime-200 to-cyan-300', 'POLO opened at a verified public-source audience baseline.', true),
  ('lil-tjay', 'Lil Tjay', 'TJAY', 84.95, 84.95, 0, 50, 1.150, 'mainstream', 'from-sky-300 via-pink-200 to-yellow-200', 'TJAY opened at a verified public-source audience baseline.', true),
  ('moneybagg-yo', 'Moneybagg Yo', 'BAGG', 83.13, 83.13, 0, 50, 1.150, 'mainstream', 'from-lime-300 via-cyan-200 to-zinc-100', 'BAGG opened at a verified public-source audience baseline.', true),
  ('young-nudy', 'Young Nudy', 'NUDY', 70.09, 70.09, 0, 50, 1.150, 'mainstream', 'from-rose-300 via-emerald-200 to-stone-100', 'NUDY opened at a verified public-source audience baseline.', true),
  ('dc-the-don', 'DC The Don', 'DCTD', 57.12, 57.12, 0, 50, 1.150, 'mainstream', 'from-sky-300 via-zinc-100 to-emerald-300', 'DCTD opened at a verified public-source audience baseline.', true),
  ('anycia', 'Anycia', 'ANYCIA', 51.05, 51.05, 0, 50, 1.600, 'rising', 'from-red-300 via-zinc-100 to-cyan-300', 'ANYCIA opened at a verified public-source audience baseline.', true),
  ('trap-dickey', 'Trap Dickey', 'TRAPD', 55.70, 55.70, 0, 50, 1.150, 'mainstream', 'from-blue-300 via-stone-100 to-emerald-300', 'TRAPD opened at a verified public-source audience baseline.', true),
  ('42-dugg', '42 Dugg', 'DUGG', 71.17, 71.17, 0, 50, 1.150, 'mainstream', 'from-amber-200 via-fuchsia-200 to-cyan-300', 'DUGG opened at a verified public-source audience baseline.', true),
  ('babyface-ray', 'Babyface Ray', 'BFRAY', 65.34, 65.34, 0, 50, 1.150, 'mainstream', 'from-fuchsia-300 via-lime-200 to-cyan-300', 'BFRAY opened at a verified public-source audience baseline.', true),
  ('loe-shimmy', 'Loe Shimmy', 'LOE', 61.89, 61.89, 0, 50, 1.150, 'mainstream', 'from-sky-300 via-pink-200 to-yellow-200', 'LOE opened at a verified public-source audience baseline.', true)
on conflict (id) do update set
  name = excluded.name,
  ticker = excluded.ticker,
  volatility = excluded.volatility,
  category = excluded.category,
  accent = excluded.accent,
  is_active = true;

insert into public.artist_stats (
  artist_id,
  streaming_growth,
  youtube_growth,
  search_growth,
  social_growth,
  news_score,
  trader_demand
)
select id, 0, 0, 0, 0, 50, 0
from public.artists
where id in (
  'polo-g', 'lil-tjay', 'moneybagg-yo', 'young-nudy', 'dc-the-don',
  'anycia', 'trap-dickey', '42-dugg', 'babyface-ray', 'loe-shimmy'
)
on conflict (artist_id) do nothing;

insert into public.artist_external_ids (
  artist_id,
  youtube_channel_id,
  musicbrainz_id,
  wikipedia_article_title,
  lastfm_name,
  gdelt_query
)
values
  ('polo-g', 'UC0ifXd2AVf1LMYbqwB5GH4g', '7e1e5648-1d6a-4248-975a-98603e781848', 'Polo G', 'Polo G', '"Polo G" rapper OR "Polo G" hip hop OR "Polo G" music'),
  ('lil-tjay', 'UCEB4a5o_6KfjxHwNMnmj54Q', 'd44b92db-dd49-4636-abe8-7c381f90b7aa', 'Lil Tjay', 'Lil Tjay', '"Lil Tjay" rapper OR "Lil Tjay" hip hop OR "Lil Tjay" music'),
  ('moneybagg-yo', 'UCrdPrDuDCbG8xayk5QkRLQA', '8971fa37-c402-474a-b897-e2bbc145b59d', 'Moneybagg Yo', 'Moneybagg Yo', '"Moneybagg Yo" rapper OR "Moneybagg Yo" hip hop OR "Moneybagg Yo" music'),
  ('young-nudy', 'UCQUsq24C0yX_ezzQYj2IjXw', '79c9b9a6-4b78-4738-8b81-95b066321ea9', 'Young Nudy', 'Young Nudy', '"Young Nudy" rapper OR "Young Nudy" hip hop OR "Young Nudy" music'),
  ('dc-the-don', 'UChlOsnwkarBH-srYGJnh46w', 'eec466a4-aec6-42ea-ab35-20416e502b9d', 'DC the Don', 'DC The Don', '"DC The Don" rapper OR "DC The Don" hip hop OR "DC The Don" music'),
  ('anycia', 'UCgoQgHZP0qTuWyk36ihA4zw', '8e504b01-438a-49d5-ac71-032d2a4e86cb', 'Anycia', 'Anycia', '"Anycia" rapper OR "Anycia" hip hop OR "Anycia" music'),
  ('trap-dickey', 'UCoxF3OvdsCBkpBhJO9xsj2g', '77f28f00-887d-4d8a-a537-1a26ae6b9862', 'Trap Dickey', 'Trap Dickey', '"Trap Dickey" rapper OR "Trap Dickey" hip hop OR "Trap Dickey" music'),
  ('42-dugg', 'UChFLDvWugOtrzxmUCAjfnGg', '4214aa04-64b0-442a-982b-0560e6d3a5bd', '42 Dugg', '42 Dugg', '"42 Dugg" rapper OR "42 Dugg" hip hop OR "42 Dugg" music'),
  ('babyface-ray', 'UCJPyo4ENRsY1zPwHRGA1iXg', 'd82481ab-4f2e-4fd7-af2f-9dbaa38704da', 'Babyface Ray', 'Babyface Ray', '"Babyface Ray" rapper OR "Babyface Ray" hip hop OR "Babyface Ray" music'),
  ('loe-shimmy', 'UCKNnh5bOfVa6xWeu9x7678Q', 'ed411d15-00f4-4e56-b264-94e0d2f64ffe', 'Loe Shimmy', 'Loe Shimmy', '"Loe Shimmy" rapper OR "Loe Shimmy" hip hop OR "Loe Shimmy" music')
on conflict (artist_id) do update set
  youtube_channel_id = excluded.youtube_channel_id,
  musicbrainz_id = excluded.musicbrainz_id,
  wikipedia_article_title = excluded.wikipedia_article_title,
  lastfm_name = excluded.lastfm_name,
  gdelt_query = excluded.gdelt_query;

insert into public.price_history (
  artist_id,
  price_date,
  price,
  hype_score,
  model_version,
  explanation
)
select
  id,
  date '2026-08-26',
  current_price,
  hype_score,
  'rmi-core-v33',
  ticker || ' opened at a verified public-source audience baseline.'
from public.artists
where id in (
  'polo-g', 'lil-tjay', 'moneybagg-yo', 'young-nudy', 'dc-the-don',
  'anycia', 'trap-dickey', '42-dugg', 'babyface-ray', 'loe-shimmy'
)
on conflict (artist_id, price_date) do nothing;

insert into public.price_ticks (
  artist_id,
  price,
  source,
  model_version,
  raw_payload
)
select
  artist.id,
  artist.current_price,
  'migration',
  'rmi-core-v33',
  jsonb_build_object(
    'reason', 'verified_source_backed_launch_listing',
    'ticker', artist.ticker,
    'opening_date', '2026-08-26'
  )
from public.artists as artist
where artist.id in (
  'polo-g', 'lil-tjay', 'moneybagg-yo', 'young-nudy', 'dc-the-don',
  'anycia', 'trap-dickey', '42-dugg', 'babyface-ray', 'loe-shimmy'
)
and not exists (
  select 1 from public.price_ticks as tick where tick.artist_id = artist.id
);

with verified_youtube_baselines (
  artist_id,
  youtube_channel_id,
  subscriber_count,
  channel_views,
  video_count
) as (
  values
    ('polo-g', 'UC0ifXd2AVf1LMYbqwB5GH4g', 6510000::numeric, 4557756498::numeric, 115::numeric),
    ('lil-tjay', 'UCEB4a5o_6KfjxHwNMnmj54Q', 6540000::numeric, 3576091438::numeric, 211::numeric),
    ('moneybagg-yo', 'UCrdPrDuDCbG8xayk5QkRLQA', 4000000::numeric, 4987941723::numeric, 165::numeric),
    ('young-nudy', 'UCQUsq24C0yX_ezzQYj2IjXw', 866000::numeric, 915736967::numeric, 180::numeric),
    ('dc-the-don', 'UChlOsnwkarBH-srYGJnh46w', 266000::numeric, 84738500::numeric, 293::numeric),
    ('anycia', 'UCgoQgHZP0qTuWyk36ihA4zw', 114000::numeric, 50852406::numeric, 114::numeric),
    ('trap-dickey', 'UCoxF3OvdsCBkpBhJO9xsj2g', 171000::numeric, 123836354::numeric, 242::numeric),
    ('42-dugg', 'UChFLDvWugOtrzxmUCAjfnGg', 984000::numeric, 1051488193::numeric, 176::numeric),
    ('babyface-ray', 'UCJPyo4ENRsY1zPwHRGA1iXg', 453000::numeric, 595914048::numeric, 43::numeric),
    ('loe-shimmy', 'UCKNnh5bOfVa6xWeu9x7678Q', 300000::numeric, 386147802::numeric, 434::numeric)
), observations as (
  select artist_id, youtube_channel_id, 'subscriber_count'::text as metric, subscriber_count as value, 'subscribers'::text as unit
  from verified_youtube_baselines
  union all
  select artist_id, youtube_channel_id, 'channel_views', channel_views, 'views'
  from verified_youtube_baselines
  union all
  select artist_id, youtube_channel_id, 'video_count', video_count, 'videos'
  from verified_youtube_baselines
)
insert into public.market_observations (
  artist_id,
  source,
  metric,
  observed_date,
  value,
  unit,
  raw_payload
)
select
  artist_id,
  'youtube',
  metric,
  date '2026-08-26',
  value,
  unit,
  jsonb_build_object(
    'status', 'verified_opening_baseline',
    'youtube_channel_id', youtube_channel_id
  )
from observations
on conflict (artist_id, source, metric, observed_date) do nothing;

with verified_lastfm_baselines (
  artist_id,
  musicbrainz_id,
  listeners,
  playcount
) as (
  values
    ('polo-g', '7e1e5648-1d6a-4248-975a-98603e781848', 1253043::numeric, 108910540::numeric),
    ('lil-tjay', 'd44b92db-dd49-4636-abe8-7c381f90b7aa', 979437::numeric, 66156674::numeric),
    ('moneybagg-yo', '8971fa37-c402-474a-b897-e2bbc145b59d', 765531::numeric, 24331804::numeric),
    ('young-nudy', '79c9b9a6-4b78-4738-8b81-95b066321ea9', 1059965::numeric, 52011063::numeric),
    ('dc-the-don', 'eec466a4-aec6-42ea-ab35-20416e502b9d', 364419::numeric, 33120663::numeric),
    ('anycia', '8e504b01-438a-49d5-ac71-032d2a4e86cb', 105636::numeric, 1162054::numeric),
    ('trap-dickey', '77f28f00-887d-4d8a-a537-1a26ae6b9862', 95269::numeric, 579409::numeric),
    ('42-dugg', '4214aa04-64b0-442a-982b-0560e6d3a5bd', 412753::numeric, 13951571::numeric),
    ('babyface-ray', 'd82481ab-4f2e-4fd7-af2f-9dbaa38704da', 390449::numeric, 13187250::numeric),
    ('loe-shimmy', 'ed411d15-00f4-4e56-b264-94e0d2f64ffe', 314854::numeric, 7514685::numeric)
), observations as (
  select artist_id, musicbrainz_id, 'listeners'::text as metric, listeners as value, 'listeners'::text as unit
  from verified_lastfm_baselines
  union all
  select artist_id, musicbrainz_id, 'playcount', playcount, 'plays'
  from verified_lastfm_baselines
)
insert into public.market_observations (
  artist_id,
  source,
  metric,
  observed_date,
  value,
  unit,
  raw_payload
)
select
  artist_id,
  'lastfm',
  metric,
  date '2026-08-26',
  value,
  unit,
  jsonb_build_object(
    'status', 'verified_opening_baseline',
    'matched_by', 'musicbrainz_id',
    'musicbrainz_id', musicbrainz_id
  )
from observations
on conflict (artist_id, source, metric, observed_date) do nothing;
