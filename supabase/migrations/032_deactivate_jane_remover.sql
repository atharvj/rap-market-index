-- Jane Remover sits outside RMI's rap-focused listing criteria. Keep the
-- historical market record intact, but remove the listing from active markets,
-- onboarding, watchlists, source collection, and new trading.
update public.artists
set
  is_active = false,
  last_move_explanation = 'Listing retired from the active RMI artist roster.'
where id = 'jane-remover';
