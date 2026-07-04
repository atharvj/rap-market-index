create extension if not exists pgcrypto;

create type artist_category as enum ('superstar', 'mainstream', 'rising', 'underground');
create type season_status as enum ('draft', 'active', 'settled');
create type transaction_type as enum ('buy', 'sell');
create type market_update_status as enum ('running', 'succeeded', 'failed');

create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date not null,
  end_date date not null,
  starting_cash numeric(14, 2) not null default 10000,
  status season_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seasons_date_order check (end_date > start_date)
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  cash_balance numeric(14, 2) not null default 10000,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_cash_nonnegative check (cash_balance >= 0),
  constraint profiles_username_length check (char_length(username) between 2 and 32)
);

create table public.artists (
  id text primary key,
  name text not null,
  ticker text not null unique,
  current_price numeric(14, 2) not null,
  previous_close numeric(14, 2) not null,
  daily_change_percent numeric(8, 4) not null default 0,
  hype_score integer not null default 50,
  volatility numeric(6, 3) not null default 1,
  category artist_category not null,
  accent text not null default 'from-mint via-cyan to-brass',
  last_move_explanation text not null default 'Initial listing.',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint artists_price_positive check (current_price > 0 and previous_close > 0),
  constraint artists_hype_score_range check (hype_score between 1 and 99),
  constraint artists_ticker_format check (ticker = upper(ticker) and ticker ~ '^[A-Z0-9]{2,8}$')
);

create table public.artist_stats (
  artist_id text primary key references public.artists(id) on delete cascade,
  streaming_growth numeric(9, 4) not null default 0,
  youtube_growth numeric(9, 4) not null default 0,
  search_growth numeric(9, 4) not null default 0,
  social_growth numeric(9, 4) not null default 0,
  news_score numeric(9, 4) not null default 50,
  trader_demand numeric(9, 4) not null default 0,
  updated_at timestamptz not null default now(),
  constraint artist_stats_news_range check (news_score between 0 and 100)
);

create table public.price_history (
  id uuid primary key default gen_random_uuid(),
  artist_id text not null references public.artists(id) on delete cascade,
  season_id uuid references public.seasons(id) on delete set null,
  price_date date not null,
  price numeric(14, 2) not null,
  hype_score integer not null,
  explanation text not null,
  created_at timestamptz not null default now(),
  unique (artist_id, price_date),
  constraint price_history_price_positive check (price > 0),
  constraint price_history_hype_score_range check (hype_score between 1 and 99)
);

create table public.holdings (
  user_id uuid not null references public.profiles(id) on delete cascade,
  artist_id text not null references public.artists(id) on delete cascade,
  season_id uuid not null references public.seasons(id) on delete cascade,
  shares numeric(18, 6) not null,
  average_buy_price numeric(14, 2) not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, artist_id, season_id),
  constraint holdings_shares_positive check (shares > 0),
  constraint holdings_avg_price_positive check (average_buy_price > 0)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  artist_id text not null references public.artists(id) on delete restrict,
  season_id uuid not null references public.seasons(id) on delete restrict,
  type transaction_type not null,
  shares numeric(18, 6) not null,
  price numeric(14, 2) not null,
  cash_delta numeric(14, 2) not null,
  created_at timestamptz not null default now(),
  constraint transactions_shares_positive check (shares > 0),
  constraint transactions_price_positive check (price > 0)
);

create table public.market_signal_snapshots (
  id uuid primary key default gen_random_uuid(),
  artist_id text not null references public.artists(id) on delete cascade,
  source_date date not null,
  streaming_growth numeric(9, 4) not null default 0,
  youtube_growth numeric(9, 4) not null default 0,
  search_growth numeric(9, 4) not null default 0,
  social_growth numeric(9, 4) not null default 0,
  news_score numeric(9, 4) not null default 50,
  trader_demand numeric(9, 4) not null default 0,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (artist_id, source_date)
);

create table public.market_update_runs (
  id uuid primary key default gen_random_uuid(),
  run_date date not null unique,
  status market_update_status not null default 'running',
  source text not null default 'mock',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  summary jsonb not null default '{}'::jsonb,
  error_message text
);

create index artists_ticker_idx on public.artists (ticker);
create index price_history_artist_date_idx on public.price_history (artist_id, price_date desc);
create index holdings_user_season_idx on public.holdings (user_id, season_id);
create index transactions_user_created_idx on public.transactions (user_id, created_at desc);
create index market_signal_snapshots_artist_date_idx on public.market_signal_snapshots (artist_id, source_date desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger seasons_set_updated_at
before update on public.seasons
for each row execute function public.set_updated_at();

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger artists_set_updated_at
before update on public.artists
for each row execute function public.set_updated_at();

create trigger holdings_set_updated_at
before update on public.holdings
for each row execute function public.set_updated_at();

create trigger artist_stats_set_updated_at
before update on public.artist_stats
for each row execute function public.set_updated_at();

create or replace view public.season_leaderboard as
select
  p.id as user_id,
  p.username,
  s.id as season_id,
  s.name as season_name,
  p.cash_balance
    + coalesce(sum(h.shares * a.current_price), 0) as portfolio_value,
  p.cash_balance,
  coalesce(sum(h.shares * a.current_price), 0) as holdings_value,
  ((p.cash_balance + coalesce(sum(h.shares * a.current_price), 0) - s.starting_cash) / s.starting_cash) * 100 as gain_percent
from public.profiles p
cross join public.seasons s
left join public.holdings h on h.user_id = p.id and h.season_id = s.id
left join public.artists a on a.id = h.artist_id
group by p.id, p.username, p.cash_balance, s.id, s.name, s.starting_cash;

alter table public.seasons enable row level security;
alter table public.profiles enable row level security;
alter table public.artists enable row level security;
alter table public.artist_stats enable row level security;
alter table public.price_history enable row level security;
alter table public.holdings enable row level security;
alter table public.transactions enable row level security;
alter table public.market_signal_snapshots enable row level security;
alter table public.market_update_runs enable row level security;

create policy "Public can read active seasons"
on public.seasons for select
using (status in ('active', 'settled'));

create policy "Public can read active artists"
on public.artists for select
using (is_active = true);

create policy "Public can read artist stats"
on public.artist_stats for select
using (true);

create policy "Public can read price history"
on public.price_history for select
using (true);

create policy "Users can read own profile"
on public.profiles for select
using (auth.uid() = id);

create policy "Users can insert own profile"
on public.profiles for insert
with check (auth.uid() = id);

create policy "Users can update own profile"
on public.profiles for update
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "Users can read own holdings"
on public.holdings for select
using (auth.uid() = user_id);

create policy "Users can read own transactions"
on public.transactions for select
using (auth.uid() = user_id);

create policy "Users can read market update summaries"
on public.market_update_runs for select
using (true);

create policy "Service role manages seasons"
on public.seasons for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create policy "Service role manages profiles"
on public.profiles for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create policy "Service role manages artists"
on public.artists for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create policy "Service role manages artist stats"
on public.artist_stats for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create policy "Service role manages price history"
on public.price_history for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create policy "Service role manages holdings"
on public.holdings for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create policy "Service role manages transactions"
on public.transactions for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create policy "Service role manages market signals"
on public.market_signal_snapshots for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create policy "Service role manages market update runs"
on public.market_update_runs for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');
