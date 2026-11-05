begin;

-- Keep source scheduling reads bounded as observation history grows.
create index if not exists market_observations_artist_source_time_idx
  on public.market_observations (artist_id, source, observed_at desc) include (observed_date);

create function public.get_latest_source_observation_times(
  p_artist_ids text[], p_source text, p_start_date date, p_end_date date
)
returns table (artist_id text, observed_at timestamptz)
language sql stable security invoker set search_path = ''
as $$
  select requested.id, latest.observed_at
  from (select distinct unnest(p_artist_ids) as id) requested
  cross join lateral (
    select observation.observed_at from public.market_observations observation
    where observation.artist_id = requested.id and observation.source = p_source
      and observation.observed_date >= p_start_date and observation.observed_date <= p_end_date
    order by observation.observed_at desc limit 1
  ) latest
  order by requested.id;
$$;

revoke all on function public.get_latest_source_observation_times(text[],text,date,date) from public,anon,authenticated;
grant execute on function public.get_latest_source_observation_times(text[],text,date,date) to service_role;
notify pgrst, 'reload schema';
commit;
