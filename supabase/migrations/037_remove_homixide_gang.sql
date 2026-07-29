-- Homixide Gang has no user positions or trade history in production and has
-- remained an uninformative flat listing. RMI uses an active-or-deleted roster,
-- so remove the listing and its source/history records instead of archiving it.
do $$
begin
  if exists (
    select 1 from public.holdings where artist_id = 'homixide-gang'
    union all
    select 1 from public.short_positions where artist_id = 'homixide-gang'
  ) then
    raise exception 'Homixide Gang still has an open user position; resolve it before removing the listing.';
  end if;
end;
$$;

update public.profiles
set favorite_artist_ids = array_remove(favorite_artist_ids, 'homixide-gang')
where 'homixide-gang' = any(favorite_artist_ids);

delete from public.short_transactions where artist_id = 'homixide-gang';
delete from public.transactions where artist_id = 'homixide-gang';
delete from public.short_positions where artist_id = 'homixide-gang';
delete from public.holdings where artist_id = 'homixide-gang';
delete from public.watchlist where artist_id = 'homixide-gang';
delete from public.artist_trading_halts where artist_id = 'homixide-gang';
delete from public.artist_external_ids where artist_id = 'homixide-gang';
delete from public.artist_stats where artist_id = 'homixide-gang';
delete from public.price_ticks where artist_id = 'homixide-gang';
delete from public.price_history where artist_id = 'homixide-gang';
delete from public.market_events where artist_id = 'homixide-gang';
delete from public.market_observations where artist_id = 'homixide-gang';
delete from public.market_signal_snapshots where artist_id = 'homixide-gang';
delete from public.artists where id = 'homixide-gang';
