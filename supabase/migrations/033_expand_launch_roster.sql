-- Permanently remove the prelaunch listings retired in production. Financial
-- tables use restrictive foreign keys for audit safety, so clear every known
-- dependent table before deleting the artist rows.
create temporary table tmp_retired_artist_ids (
  id text primary key
) on commit drop;

insert into tmp_retired_artist_ids (id)
select id
from public.artists
where is_active = false
   or id in ('bleood', 'jane-remover', 'plaqueboymax');

delete from public.short_transactions where artist_id in (select id from tmp_retired_artist_ids);
delete from public.transactions where artist_id in (select id from tmp_retired_artist_ids);
delete from public.short_positions where artist_id in (select id from tmp_retired_artist_ids);
delete from public.holdings where artist_id in (select id from tmp_retired_artist_ids);
delete from public.watchlist where artist_id in (select id from tmp_retired_artist_ids);
delete from public.artist_trading_halts where artist_id in (select id from tmp_retired_artist_ids);
delete from public.artist_external_ids where artist_id in (select id from tmp_retired_artist_ids);
delete from public.artist_stats where artist_id in (select id from tmp_retired_artist_ids);
delete from public.price_ticks where artist_id in (select id from tmp_retired_artist_ids);
delete from public.price_history where artist_id in (select id from tmp_retired_artist_ids);
delete from public.market_events where artist_id in (select id from tmp_retired_artist_ids);
delete from public.market_observations where artist_id in (select id from tmp_retired_artist_ids);
delete from public.market_signal_snapshots where artist_id in (select id from tmp_retired_artist_ids);
delete from public.artists where id in (select id from tmp_retired_artist_ids);

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
  ('chief-keef', 'Chief Keef', 'KEEF', 74.09, 74.09, 0, 50, 1.150, 'mainstream', 'from-blue-300 via-stone-100 to-emerald-300', 'KEEF opened at a source-backed audience baseline.', true),
  ('nicki-minaj', 'Nicki Minaj', 'NICKI', 118.78, 118.78, 0, 50, 0.850, 'superstar', 'from-sky-300 via-pink-200 to-yellow-200', 'NICKI opened at a source-backed audience baseline.', true),
  ('rod-wave', 'Rod Wave', 'ROD', 72.85, 72.85, 0, 50, 1.150, 'mainstream', 'from-blue-300 via-stone-100 to-emerald-300', 'ROD opened at a source-backed audience baseline.', true),
  ('nle-choppa', 'NLE Choppa', 'NLE', 81.17, 81.17, 0, 50, 1.150, 'mainstream', 'from-fuchsia-300 via-lime-200 to-cyan-300', 'NLE opened at a source-backed audience baseline.', true),
  ('g-herbo', 'G Herbo', 'HERBO', 54.91, 54.91, 0, 50, 1.600, 'rising', 'from-amber-200 via-fuchsia-200 to-cyan-300', 'HERBO opened at a source-backed audience baseline.', true),
  ('pooh-shiesty', 'Pooh Shiesty', 'POOH', 54.52, 54.52, 0, 50, 1.600, 'rising', 'from-sky-300 via-pink-200 to-yellow-200', 'POOH opened at a source-backed audience baseline.', true),
  ('bossman-dlow', 'BossMan Dlow', 'DLOW', 45.30, 45.30, 0, 50, 1.600, 'rising', 'from-red-300 via-zinc-100 to-cyan-300', 'DLOW opened at a source-backed audience baseline.', true),
  ('sahbabii', 'SahBabii', 'SAH', 37.34, 37.34, 0, 50, 1.600, 'rising', 'from-sky-300 via-pink-200 to-yellow-200', 'SAH opened at a source-backed audience baseline.', true),
  ('nemzzz', 'Nemzzz', 'NEMZZZ', 47.42, 47.42, 0, 50, 1.600, 'rising', 'from-sky-300 via-zinc-100 to-emerald-300', 'NEMZZZ opened at a source-backed audience baseline.', true),
  ('luh-tyler', 'Luh Tyler', 'LUHT', 35.01, 35.01, 0, 50, 1.600, 'rising', 'from-rose-300 via-emerald-200 to-stone-100', 'LUHT opened at a source-backed audience baseline.', true),
  ('1900rugrat', '1900Rugrat', 'RUGRAT', 30.20, 30.20, 0, 50, 1.600, 'rising', 'from-amber-200 via-fuchsia-200 to-cyan-300', 'RUGRAT opened at a source-backed audience baseline.', true),
  ('hurricane-wisdom', 'Hurricane Wisdom', 'WISDOM', 29.71, 29.71, 0, 50, 1.600, 'rising', 'from-fuchsia-300 via-lime-200 to-cyan-300', 'WISDOM opened at a source-backed audience baseline.', true)
on conflict (id) do update set
  name = excluded.name,
  ticker = excluded.ticker,
  current_price = excluded.current_price,
  previous_close = excluded.previous_close,
  daily_change_percent = excluded.daily_change_percent,
  hype_score = excluded.hype_score,
  volatility = excluded.volatility,
  category = excluded.category,
  accent = excluded.accent,
  last_move_explanation = excluded.last_move_explanation,
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
  'chief-keef', 'nicki-minaj', 'rod-wave', 'nle-choppa', 'g-herbo', 'pooh-shiesty',
  'bossman-dlow', 'sahbabii', 'nemzzz', 'luh-tyler', '1900rugrat', 'hurricane-wisdom'
)
on conflict (artist_id) do update set
  streaming_growth = excluded.streaming_growth,
  youtube_growth = excluded.youtube_growth,
  search_growth = excluded.search_growth,
  social_growth = excluded.social_growth,
  news_score = excluded.news_score,
  trader_demand = excluded.trader_demand;

insert into public.artist_external_ids (
  artist_id,
  youtube_channel_id,
  musicbrainz_id,
  wikipedia_article_title,
  lastfm_name,
  gdelt_query
)
values
  ('chief-keef', 'UC0032Wkd3aCT4rRi1YOV3gQ', '9118f524-be76-4eaf-875c-ccf15e2a2ad6', 'Chief Keef', 'Chief Keef', '"Chief Keef" rapper OR "Chief Keef" hip hop OR "Chief Keef" music'),
  ('nicki-minaj', 'UC3jOd7GUMhpgJRBhiLzuLsg', '1036b808-f58c-4a3e-b461-a2c4492ecf1b', 'Nicki Minaj', 'Nicki Minaj', '"Nicki Minaj" rapper OR "Nicki Minaj" hip hop OR "Nicki Minaj" music'),
  ('rod-wave', 'UCenjunBhBhvKjfDAESnoppw', 'cb3d3e49-bf08-4cdb-bfa8-4dc7c458cea1', 'Rod Wave', 'Rod Wave', '"Rod Wave" rapper OR "Rod Wave" hip hop OR "Rod Wave" music'),
  ('nle-choppa', 'UCWICXNlSLc7eeNazpzUZcLg', '2873b450-13c6-4ca1-8ca3-646c25af3202', 'NLE Choppa', 'NLE Choppa', '"NLE Choppa" rapper OR "NLE Choppa" hip hop OR "NLE Choppa" music'),
  ('g-herbo', 'UCV0pIPt5HFfulonNog3cz1A', '1b1f50d1-4746-468b-a6a2-7db7200d3dfc', 'G Herbo', 'G Herbo', '"G Herbo" rapper OR "G Herbo" hip hop OR "G Herbo" music'),
  ('pooh-shiesty', 'UCTBIIbIs83IBsy4E1BQxYBw', '82cc5b8b-22e8-48e3-9f97-6ab39ac316d6', 'Pooh Shiesty', 'Pooh Shiesty', '"Pooh Shiesty" rapper OR "Pooh Shiesty" hip hop OR "Pooh Shiesty" music'),
  ('bossman-dlow', 'UC1NZP8d-VFjV-kKSo6lDBig', '44fac0de-d5ae-4bea-a68c-948fedc3d9c5', 'BossMan Dlow', 'BossMan Dlow', '"BossMan Dlow" rapper OR "BossMan Dlow" hip hop OR "BossMan Dlow" music'),
  ('sahbabii', 'UCfUGy8RvgutYIJ5uOE-Rgcg', '5e934be9-8295-4215-a60f-f5f2386179a3', 'SahBabii', 'SahBabii', '"SahBabii" rapper OR "SahBabii" hip hop OR "SahBabii" music'),
  ('nemzzz', 'UC3ytAKP00gWDkiOrcKfOwTQ', 'd2a36c92-546b-4b81-b31b-23e21d2ea6ee', 'Nemzzz', 'Nemzzz', '"Nemzzz" rapper OR "Nemzzz" hip hop OR "Nemzzz" music'),
  ('luh-tyler', 'UCwEG-vwbSPLEJGlLmgFneiA', '1f375ea1-617d-485b-ae29-d220bfc1f501', 'Luh Tyler', 'Luh Tyler', '"Luh Tyler" rapper OR "Luh Tyler" hip hop OR "Luh Tyler" music'),
  ('1900rugrat', 'UCfiRrH6OkNSi7jZ15HQXNlA', 'e9ef6e2b-3117-4c09-938e-21b79527306b', '1900Rugrat', '1900Rugrat', '"1900Rugrat" rapper OR "1900Rugrat" hip hop OR "1900Rugrat" music'),
  ('hurricane-wisdom', 'UC-tAx6tWF3x-7COrjnpV4Zg', 'bf133b83-6cbd-4cf0-bda1-f2ad3bf24e23', 'Hurricane Wisdom', 'Hurricane Wisdom', '"Hurricane Wisdom" rapper OR "Hurricane Wisdom" hip hop OR "Hurricane Wisdom" music')
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
  timezone('America/New_York', now())::date,
  current_price,
  hype_score,
  'rmi-core-v27',
  ticker || ' opened at a source-backed audience baseline.'
from public.artists
where id in (
  'chief-keef', 'nicki-minaj', 'rod-wave', 'nle-choppa', 'g-herbo', 'pooh-shiesty',
  'bossman-dlow', 'sahbabii', 'nemzzz', 'luh-tyler', '1900rugrat', 'hurricane-wisdom'
)
on conflict (artist_id, price_date) do update set
  price = excluded.price,
  hype_score = excluded.hype_score,
  model_version = excluded.model_version,
  explanation = excluded.explanation;

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
  'rmi-core-v27',
  jsonb_build_object('reason', 'source_backed_launch_listing', 'ticker', artist.ticker)
from public.artists as artist
where artist.id in (
  'chief-keef', 'nicki-minaj', 'rod-wave', 'nle-choppa', 'g-herbo', 'pooh-shiesty',
  'bossman-dlow', 'sahbabii', 'nemzzz', 'luh-tyler', '1900rugrat', 'hurricane-wisdom'
)
and not exists (
  select 1 from public.price_ticks as tick where tick.artist_id = artist.id
);
