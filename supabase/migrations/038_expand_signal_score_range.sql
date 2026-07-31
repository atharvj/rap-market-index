alter table public.artists
  drop constraint if exists artists_hype_score_range;

alter table public.artists
  add constraint artists_hype_score_range check (hype_score between 1 and 100);

alter table public.price_history
  drop constraint if exists price_history_hype_score_range;

alter table public.price_history
  add constraint price_history_hype_score_range check (hype_score between 1 and 100);
