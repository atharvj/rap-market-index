revoke execute on function public.apply_artist_trade_impact(text, numeric, integer) from public, anon, authenticated;
revoke execute on function public.buy_artist_shares(text, numeric, uuid) from public, anon;
revoke execute on function public.sell_artist_shares(text, numeric, uuid) from public, anon;

grant execute on function public.buy_artist_shares(text, numeric, uuid) to authenticated;
grant execute on function public.sell_artist_shares(text, numeric, uuid) to authenticated;
