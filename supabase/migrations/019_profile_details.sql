alter table if exists public.profiles
  add column if not exists bio text not null default '',
  add column if not exists favorite_artist_ids text[] not null default '{}';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_bio_length'
  ) then
    alter table public.profiles
      add constraint profiles_bio_length check (char_length(bio) <= 280);
  end if;
end $$;
