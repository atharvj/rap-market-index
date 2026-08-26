-- Protect has no production holdings, transactions, watchlists, or profile
-- favorites and has produced an uninformative mostly-flat quote history. Keep
-- the historical record auditable while removing the listing from active
-- markets, discovery, source collection, onboarding, and new trading.
update public.artists
set
  is_active = false,
  last_move_explanation = 'Listing retired from the active RMI artist roster.'
where id = 'protect';
