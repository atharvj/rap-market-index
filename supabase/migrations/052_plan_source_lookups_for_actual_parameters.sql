begin;

-- SQL-language function caching chose an expensive generic plan for populated
-- sources, despite a fast indexed plan for the same concrete source/date values.
-- EXECUTE plans this fixed SELECT for the actual arguments on every call. Values
-- remain bound parameters; no artist/source text is interpolated into SQL.
create or replace function public.get_latest_source_observation_times(
  p_artist_ids text[], p_source text, p_start_date date, p_end_date date
)
returns table (artist_id text, observed_at timestamptz)
language plpgsql stable security invoker set search_path = ''
as $$
begin
  return query execute $query$
    select requested.id, latest.observed_at
    from (select distinct unnest($1::text[]) as id) requested
    cross join lateral (
      select observation.observed_at from public.market_observations observation
      where observation.artist_id = requested.id and observation.source = $2
        and observation.observed_date >= $3 and observation.observed_date <= $4
      order by observation.observed_at desc limit 1
    ) latest
    order by requested.id
  $query$ using p_artist_ids, p_source, p_start_date, p_end_date;
end;
$$;

revoke all on function public.get_latest_source_observation_times(text[],text,date,date) from public,anon,authenticated;
grant execute on function public.get_latest_source_observation_times(text[],text,date,date) to service_role;
notify pgrst, 'reload schema';
commit;
