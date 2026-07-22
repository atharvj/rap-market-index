begin;

do $$
declare
  conflicting_username text;
begin
  select lower(username)
  into conflicting_username
  from public.profiles
  group by lower(username)
  having count(*) > 1
  limit 1;

  if conflicting_username is not null then
    raise exception 'Resolve duplicate usernames that differ only by letter case before applying this migration.';
  end if;
end
$$;

create unique index if not exists profiles_username_case_insensitive_unique
  on public.profiles (lower(username));

commit;
