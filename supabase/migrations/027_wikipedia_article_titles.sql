alter table public.artist_external_ids
add column if not exists wikipedia_article_title text;

comment on column public.artist_external_ids.wikipedia_article_title is
  'Exact English Wikipedia article title used for Wikimedia pageview collection.';
