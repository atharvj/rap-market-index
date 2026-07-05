create or replace function pg_temp.rmi_default_gdelt_query(p_artist_id text, p_artist_name text)
returns text
language sql
immutable
as $$
  select case p_artist_id
    when '1oneam' then '"1oneam" rapper OR "1oneam" music'
    when '2hollis' then '"2hollis" rapper OR "2hollis" music'
    when '2slimey' then '"2slimey" rapper OR "2slimey" music'
    when 'autumn' then '"Autumn!" rapper OR "Autumn" rapper music'
    when 'che' then '"Che" rapper music'
    when 'feng' then '"Feng" rapper music'
    when 'future' then '"Future" rapper OR "Future" hip hop OR "Future" album'
    when 'ian' then '"ian" rapper music OR "ian" rap artist'
    when 'jay-z' then '"Jay-Z" rapper OR "Jay Z" music'
    when 'lucy-bedrouqe' then '"Lucy Bedrouqe" rapper OR "Lucy Bedrouqe" music'
    when 'protect' then '"Protect" rapper music OR "Protect" rap artist'
    when 'tana' then '"Tana" rapper OR "BabySantana" rapper OR "Tana" music'
    when 'ye' then '"Ye" rapper OR "Kanye West" music OR "Kanye West" album'
    else '"' || replace(p_artist_name, '"', '') || '" rapper OR "' || replace(p_artist_name, '"', '') || '" hip hop OR "' || replace(p_artist_name, '"', '') || '" music'
  end;
$$;

insert into public.artist_external_ids (
  artist_id,
  lastfm_name,
  gdelt_query
)
select
  id,
  name,
  pg_temp.rmi_default_gdelt_query(id, name)
from public.artists
where is_active = true
on conflict (artist_id) do update set
  lastfm_name = coalesce(nullif(public.artist_external_ids.lastfm_name, ''), excluded.lastfm_name),
  gdelt_query = coalesce(nullif(public.artist_external_ids.gdelt_query, ''), excluded.gdelt_query);

notify pgrst, 'reload schema';
