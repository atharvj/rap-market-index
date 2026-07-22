create temporary table if not exists tmp_artist_roster (
  sort_order integer primary key,
  id text not null,
  name text not null,
  ticker text not null,
  current_price numeric not null,
  previous_close numeric not null,
  volatility numeric not null,
  category public.artist_category not null,
  accent text not null
) on commit drop;

truncate table tmp_artist_roster;

insert into tmp_artist_roster (
  sort_order,
  id,
  name,
  ticker,
  current_price,
  previous_close,
  volatility,
  category,
  accent
)
values
  (0, 'drake', 'Drake', 'DRAKE', 132.45, 134.10, 0.760, 'superstar', 'from-fuchsia-300 via-lime-200 to-cyan-300'),
  (1, 'kendrick-lamar', 'Kendrick Lamar', 'KDOT', 118.80, 115.60, 0.820, 'superstar', 'from-sky-300 via-pink-200 to-yellow-200'),
  (2, 'travis-scott', 'Travis Scott', 'TRAVIS', 124.70, 121.20, 0.920, 'superstar', 'from-lime-300 via-cyan-200 to-zinc-100'),
  (3, 'ye', 'Ye', 'YE', 110.50, 112.20, 0.900, 'superstar', 'from-rose-300 via-emerald-200 to-stone-100'),
  (4, 'eminem', 'Eminem', 'EMNM', 118.50, 116.90, 0.700, 'superstar', 'from-violet-300 via-zinc-100 to-emerald-300'),
  (5, 'jay-z', 'Jay-Z', 'JAYZ', 121.30, 120.50, 0.680, 'superstar', 'from-red-300 via-zinc-100 to-cyan-300'),
  (6, 'tyler-the-creator', 'Tyler, The Creator', 'TYLER', 116.30, 114.70, 0.800, 'superstar', 'from-blue-300 via-stone-100 to-emerald-300'),
  (7, 'future', 'Future', 'FUTR', 88.20, 84.70, 1.020, 'mainstream', 'from-amber-200 via-fuchsia-200 to-cyan-300'),
  (8, 'playboi-carti', 'Playboi Carti', 'CARTI', 91.40, 97.20, 1.280, 'mainstream', 'from-fuchsia-300 via-lime-200 to-cyan-300'),
  (9, 'don-toliver', 'Don Toliver', 'DON', 74.25, 72.00, 1.100, 'mainstream', 'from-sky-300 via-pink-200 to-yellow-200'),
  (10, 'youngboy-never-broke-again', 'YoungBoy Never Broke Again', 'YB', 67.20, 65.40, 1.180, 'mainstream', 'from-lime-300 via-cyan-200 to-zinc-100'),
  (11, 'lil-uzi-vert', 'Lil Uzi Vert', 'UZI', 76.40, 74.90, 1.050, 'mainstream', 'from-rose-300 via-emerald-200 to-stone-100'),
  (12, 'central-cee', 'Central Cee', 'CENCH', 63.70, 61.90, 1.140, 'mainstream', 'from-violet-300 via-zinc-100 to-emerald-300'),
  (13, 'asap-rocky', 'A$AP Rocky', 'ASAP', 72.40, 70.80, 1.020, 'mainstream', 'from-red-300 via-zinc-100 to-cyan-300'),
  (14, 'lil-yachty', 'Lil Yachty', 'YACHTY', 58.50, 56.80, 1.200, 'mainstream', 'from-blue-300 via-stone-100 to-emerald-300'),
  (15, 'young-thug', 'Young Thug', 'THUG', 82.10, 79.80, 1.050, 'mainstream', 'from-amber-200 via-fuchsia-200 to-cyan-300'),
  (16, 'lil-baby', 'Lil Baby', 'LBABY', 73.20, 71.10, 1.080, 'mainstream', 'from-fuchsia-300 via-lime-200 to-cyan-300'),
  (17, 'gunna', 'Gunna', 'GUNNA', 70.50, 68.60, 1.040, 'mainstream', 'from-sky-300 via-pink-200 to-yellow-200'),
  (18, 'yeat', 'Yeat', 'YEAT', 52.60, 48.70, 1.420, 'rising', 'from-lime-300 via-cyan-200 to-zinc-100'),
  (19, 'ken-carson', 'Ken Carson', 'KEN', 41.75, 39.20, 1.480, 'rising', 'from-rose-300 via-emerald-200 to-stone-100'),
  (20, 'baby-keem', 'Baby Keem', 'KEEM', 54.30, 52.10, 1.240, 'rising', 'from-violet-300 via-zinc-100 to-emerald-300'),
  (21, 'sexyy-red', 'Sexyy Red', 'SEXYY', 39.80, 41.00, 1.420, 'rising', 'from-red-300 via-zinc-100 to-cyan-300'),
  (22, 'doechii', 'Doechii', 'DOECHII', 47.60, 45.30, 1.380, 'rising', 'from-blue-300 via-stone-100 to-emerald-300'),
  (23, 'destroy-lonely', 'Destroy Lonely', 'LONE', 29.40, 30.20, 1.650, 'rising', 'from-amber-200 via-fuchsia-200 to-cyan-300'),
  (24, 'lucki', 'Lucki', 'LUCKI', 36.90, 34.50, 1.420, 'rising', 'from-fuchsia-300 via-lime-200 to-cyan-300'),
  (25, 'jid', 'JID', 'JID', 43.60, 42.20, 1.320, 'rising', 'from-sky-300 via-pink-200 to-yellow-200'),
  (26, 'flo-milli', 'Flo Milli', 'FLO', 35.40, 33.80, 1.500, 'rising', 'from-lime-300 via-cyan-200 to-zinc-100'),
  (27, 'ian', 'ian', 'IAN', 44.80, 42.30, 1.520, 'rising', 'from-rose-300 via-emerald-200 to-stone-100'),
  (28, '2hollis', '2hollis', '2HOL', 31.60, 29.90, 1.680, 'rising', 'from-violet-300 via-zinc-100 to-emerald-300'),
  (29, 'homixide-gang', 'Homixide Gang', 'HXG', 34.20, 32.60, 1.620, 'rising', 'from-red-300 via-zinc-100 to-cyan-300'),
  (31, 'osamason', 'Osamason', 'OSAMA', 24.65, 21.80, 1.820, 'underground', 'from-amber-200 via-fuchsia-200 to-cyan-300'),
  (32, 'fakemink', 'Fakemink', 'FAKEM', 12.40, 11.75, 1.950, 'underground', 'from-fuchsia-300 via-lime-200 to-cyan-300'),
  (33, 'lucy-bedrouqe', 'Lucy Bedrouqe', 'LUCYB', 9.85, 10.20, 1.880, 'underground', 'from-sky-300 via-pink-200 to-yellow-200'),
  (34, 'nettspend', 'Nettspend', 'NETT', 27.30, 25.10, 1.780, 'underground', 'from-lime-300 via-cyan-200 to-zinc-100'),
  (35, 'che', 'Che', 'CHE', 18.40, 16.20, 1.740, 'underground', 'from-rose-300 via-emerald-200 to-stone-100'),
  (36, 'jaydes', 'Jaydes', 'JAYDES', 14.25, 15.10, 1.920, 'underground', 'from-violet-300 via-zinc-100 to-emerald-300'),
  (37, 'esdeekid', 'EsDeeKid', 'ESDEE', 10.60, 9.70, 2.020, 'underground', 'from-red-300 via-zinc-100 to-cyan-300'),
  (38, '1oneam', '1oneam', '1ONEAM', 8.95, 8.10, 2.080, 'underground', 'from-blue-300 via-stone-100 to-emerald-300'),
  (39, 'duwap-kaine', 'Duwap Kaine', 'DUWAP', 13.75, 13.10, 1.900, 'underground', 'from-amber-200 via-fuchsia-200 to-cyan-300'),
  (40, 'autumn', 'Autumn', 'AUTUMN', 16.80, 15.95, 1.860, 'underground', 'from-fuchsia-300 via-lime-200 to-cyan-300'),
  (41, 'molly-santana', 'Molly Santana', 'MOLLY', 15.30, 14.05, 1.940, 'underground', 'from-sky-300 via-pink-200 to-yellow-200'),
  (42, 'tana', 'Tana', 'TANA', 17.45, 18.30, 1.880, 'underground', 'from-lime-300 via-cyan-200 to-zinc-100'),
  (43, '2slimey', '2slimey', '2SLIME', 7.40, 6.95, 2.150, 'underground', 'from-rose-300 via-emerald-200 to-stone-100'),
  (44, 'nine-vicious', 'Nine Vicious', 'NINEV', 6.85, 7.10, 2.120, 'underground', 'from-violet-300 via-zinc-100 to-emerald-300'),
  (45, 'yung-fazo', 'Yung Fazo', 'FAZO', 11.30, 12.10, 1.920, 'underground', 'from-red-300 via-zinc-100 to-cyan-300'),
  (46, 'feng', 'Feng', 'FENG', 5.95, 5.50, 2.200, 'underground', 'from-blue-300 via-stone-100 to-emerald-300'),
  (47, 'bleood', 'Bleood', 'BLEOD', 7.85, 6.40, 2.050, 'underground', 'from-amber-200 via-fuchsia-200 to-cyan-300'),
  (48, 'slayr', 'Slayr', 'SLAYR', 8.60, 8.25, 2.060, 'underground', 'from-fuchsia-300 via-lime-200 to-cyan-300'),
  (50, 'lazerdim700', 'Lazer Dim 700', 'LZR700', 19.75, 17.90, 1.980, 'underground', 'from-lime-300 via-cyan-200 to-zinc-100'),
  (51, 'protect', 'Protect', 'PRTCT', 6.70, 6.45, 2.120, 'underground', 'from-rose-300 via-emerald-200 to-stone-100'),
  (52, 'xaviersobased', 'xaviersobased', 'XAVIER', 12.95, 12.20, 1.960, 'underground', 'from-violet-300 via-zinc-100 to-emerald-300'),
  (53, 'prettifun', 'prettifun', 'PRETTI', 6.25, 5.85, 2.180, 'underground', 'from-red-300 via-zinc-100 to-cyan-300'),
  (54, 'babychiefdoit', 'BabyChiefDoIt', 'BCDOIT', 8.20, 7.70, 2.140, 'underground', 'from-blue-300 via-stone-100 to-emerald-300');

create or replace function pg_temp.rmi_round_signal(p_value numeric)
returns numeric
language sql
immutable
as $$
  select round(least(95::numeric, greatest(-35::numeric, p_value)), 1);
$$;

drop table if exists tmp_artist_roster_stats;

create temporary table tmp_artist_roster_stats on commit drop as
with scored as (
  select
    roster.*,
    sin(((roster.sort_order + 1) * 1.7)::double precision) as wave,
    cos(((roster.sort_order + 2) * 1.15)::double precision) as counter_wave,
    (8 + (roster.sort_order % 6) * 4 + roster.volatility * 5) as momentum
  from tmp_artist_roster as roster
)
select
  sort_order,
  id,
  name,
  ticker,
  current_price,
  previous_close,
  volatility,
  category,
  accent,
  pg_temp.rmi_round_signal(momentum + (wave * 6)::numeric) as streaming_growth,
  pg_temp.rmi_round_signal(momentum * 0.65 + (counter_wave * 5)::numeric) as youtube_growth,
  pg_temp.rmi_round_signal(momentum * 0.9 + ((sort_order % 4) - 1) * 7) as search_growth,
  pg_temp.rmi_round_signal(momentum * 1.1 + (wave * 10)::numeric) as social_growth,
  pg_temp.rmi_round_signal(48 + (sort_order % 5) * 4 + (counter_wave * 5)::numeric) as news_score,
  pg_temp.rmi_round_signal(((sort_order % 7) - 3) * 4 + (wave * 8)::numeric) as trader_demand
from scored;

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
select
  id,
  name,
  ticker,
  current_price,
  previous_close,
  round(((current_price - previous_close) / previous_close) * 100, 4),
  public.calculate_hype_score(
    streaming_growth,
    youtube_growth,
    search_growth,
    social_growth,
    news_score,
    trader_demand
  ),
  volatility,
  category,
  accent,
  ticker || ' moved as audience momentum, media activity, and trading demand shifted.',
  true
from tmp_artist_roster_stats
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
where id not in (select id from tmp_artist_roster_stats);

insert into public.artist_stats (
  artist_id,
  streaming_growth,
  youtube_growth,
  search_growth,
  social_growth,
  news_score,
  trader_demand
)
select
  id,
  streaming_growth,
  youtube_growth,
  search_growth,
  social_growth,
  news_score,
  trader_demand
from tmp_artist_roster_stats
on conflict (artist_id) do update set
  streaming_growth = excluded.streaming_growth,
  youtube_growth = excluded.youtube_growth,
  search_growth = excluded.search_growth,
  social_growth = excluded.social_growth,
  news_score = excluded.news_score,
  trader_demand = excluded.trader_demand;

drop table if exists tmp_artist_roster_stats;
drop table if exists tmp_artist_roster;
