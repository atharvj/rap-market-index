-- Restore Doechii's verified source mapping so every collector uses the exact
-- artist instead of relying on ambiguous name-only discovery.
insert into public.artist_external_ids (
  artist_id,
  youtube_channel_id,
  musicbrainz_id,
  wikipedia_article_title,
  lastfm_name,
  gdelt_query
)
values (
  'doechii',
  'UCksiqtuWYtN2YluvAQnV2dQ',
  '9f75277c-b283-4846-ac8c-f932255cd0ac',
  'Doechii',
  'Doechii',
  '"Doechii" rapper OR "Doechii" hip hop OR "Doechii" music'
)
on conflict (artist_id) do update set
  youtube_channel_id = excluded.youtube_channel_id,
  musicbrainz_id = excluded.musicbrainz_id,
  wikipedia_article_title = excluded.wikipedia_article_title,
  lastfm_name = excluded.lastfm_name,
  gdelt_query = excluded.gdelt_query;
