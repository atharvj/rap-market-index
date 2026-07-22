-- RMI uses an active-or-deleted roster. Temporary operational problems should
-- use trading halts instead of creating hidden listings with stale data.
do $$
begin
  if exists (select 1 from public.artists where is_active = false) then
    raise exception 'Remove inactive artist rows before enabling the active-only roster constraint.';
  end if;
end;
$$;

alter table public.artists
drop constraint if exists artists_active_only;

alter table public.artists
add constraint artists_active_only check (is_active = true);

comment on constraint artists_active_only on public.artists is
  'Every roster row is public and market-updated; removed listings are deleted rather than archived.';
