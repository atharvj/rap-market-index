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
  last_move_explanation
)
values
  ('playboi-carti', 'Playboi Carti', 'CARTI', 91.40, 97.20, -5.9671, 55, 1.280, 'mainstream', 'from-rose-400 via-zinc-100 to-cyan-300', 'CARTI slipped as selling pressure outweighed social trend strength.'),
  ('drake', 'Drake', 'DRAKE', 132.45, 134.10, -1.2304, 51, 0.760, 'superstar', 'from-blue-300 via-stone-100 to-emerald-300', 'DRAKE softened as momentum cooled despite a large baseline audience.'),
  ('future', 'Future', 'FUTR', 88.20, 84.70, 4.1322, 64, 1.020, 'mainstream', 'from-violet-300 via-zinc-100 to-emerald-300', 'FUTR advanced with streaming growth and healthy trader demand.'),
  ('che', 'Che', 'CHE', 18.40, 16.20, 13.5802, 86, 1.740, 'underground', 'from-lime-300 via-cyan-200 to-zinc-100', 'CHE jumped as underground discovery and social clips accelerated.'),
  ('osamason', 'Osamason', 'OSAMA', 24.65, 21.80, 13.0734, 87, 1.820, 'underground', 'from-fuchsia-300 via-lime-200 to-cyan-300', 'OSAMA rallied as online momentum and trader demand stacked together.'),
  ('yung-fazo', 'Yung Fazo', 'FAZO', 11.30, 12.10, -6.6116, 52, 1.920, 'underground', 'from-sky-300 via-pink-200 to-yellow-200', 'FAZO dipped as trader demand cooled despite social discovery holding up.'),
  ('yeat', 'Yeat', 'YEAT', 52.60, 48.70, 8.0082, 74, 1.420, 'rising', 'from-lime-300 via-fuchsia-200 to-cyan-300', 'YEAT broke higher as search and social growth outpaced the market.'),
  ('ken-carson', 'Ken Carson', 'KEN', 41.75, 39.20, 6.5051, 72, 1.480, 'rising', 'from-red-300 via-zinc-100 to-cyan-300', 'KEN moved up as fan trading and social velocity improved.'),
  ('bleood', 'Bleood', 'BLEOD', 7.85, 6.40, 22.6563, 95, 2.050, 'underground', 'from-rose-300 via-emerald-200 to-stone-100', 'BLEOD spiked as a low-price underground listing caught discovery momentum.'),
  ('eminem', 'Eminem', 'EMNM', 118.50, 116.90, 1.3687, 55, 0.700, 'superstar', 'from-stone-100 via-red-300 to-zinc-400', 'EMNM edged higher on steady catalog strength and light trader demand.')
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

update public.artists
set is_active = false
where id not in (
  'playboi-carti',
  'drake',
  'future',
  'che',
  'osamason',
  'yung-fazo',
  'yeat',
  'ken-carson',
  'bleood',
  'eminem'
);

insert into public.artist_stats (
  artist_id,
  streaming_growth,
  youtube_growth,
  search_growth,
  social_growth,
  news_score,
  trader_demand
)
values
  ('playboi-carti', -3.2, 2.4, 16.7, 28.9, 64, -11.2),
  ('drake', 1.8, -0.6, 2.1, 1.4, 54, -3.4),
  ('future', 9.9, 7.7, 8.5, 13.2, 62, 8.6),
  ('che', 29.8, 21.4, 38.6, 47.2, 58, 24.1),
  ('osamason', 31.2, 18.8, 34.1, 52.9, 61, 26.4),
  ('yung-fazo', -4.8, 6.5, 13.7, 22.4, 46, -6.2),
  ('yeat', 18.9, 12.8, 23.2, 31.4, 61, 18.2),
  ('ken-carson', 16.4, 14.9, 19.8, 28.6, 57, 15.3),
  ('bleood', 42.6, 26.3, 48.1, 64.4, 43, 31.8),
  ('eminem', 2.6, 4.1, 5.5, 3.8, 56, 3.1)
on conflict (artist_id) do update set
  streaming_growth = excluded.streaming_growth,
  youtube_growth = excluded.youtube_growth,
  search_growth = excluded.search_growth,
  social_growth = excluded.social_growth,
  news_score = excluded.news_score,
  trader_demand = excluded.trader_demand;
