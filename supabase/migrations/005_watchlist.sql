create table if not exists public.watchlist (
  user_id uuid not null references public.profiles(id) on delete cascade,
  artist_id text not null references public.artists(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, artist_id)
);

create index if not exists watchlist_user_created_idx on public.watchlist (user_id, created_at desc);

alter table public.watchlist enable row level security;

drop policy if exists "Users can read own watchlist" on public.watchlist;
drop policy if exists "Users can insert own watchlist" on public.watchlist;
drop policy if exists "Users can update own watchlist" on public.watchlist;
drop policy if exists "Users can delete own watchlist" on public.watchlist;
drop policy if exists "Service role manages watchlist" on public.watchlist;

create policy "Users can read own watchlist"
on public.watchlist for select
using (auth.uid() = user_id);

create policy "Users can insert own watchlist"
on public.watchlist for insert
with check (auth.uid() = user_id);

create policy "Users can update own watchlist"
on public.watchlist for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete own watchlist"
on public.watchlist for delete
using (auth.uid() = user_id);

create policy "Service role manages watchlist"
on public.watchlist for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

notify pgrst, 'reload schema';
