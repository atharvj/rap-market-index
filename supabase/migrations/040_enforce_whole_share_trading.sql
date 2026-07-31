begin;

-- RMI trades whole fantasy shares. Keep historical rows readable while
-- rejecting fractional quantities on every new or updated position/order.
alter table public.holdings
  add constraint holdings_shares_whole
  check (shares = trunc(shares)) not valid;

alter table public.transactions
  add constraint transactions_shares_whole
  check (shares = trunc(shares)) not valid;

alter table public.short_positions
  add constraint short_positions_shares_whole
  check (shares = trunc(shares)) not valid;

alter table public.short_transactions
  add constraint short_transactions_shares_whole
  check (shares = trunc(shares)) not valid;

notify pgrst, 'reload schema';

commit;
