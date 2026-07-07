alter table if exists public.profiles
  add column if not exists avatar_url text not null default '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_avatar_url_length'
  ) then
    alter table public.profiles
      add constraint profiles_avatar_url_length check (char_length(avatar_url) <= 1000);
  end if;
end $$;
