begin;

-- Enforce the market gate for all order sides inside the database transaction.
create or replace function public.execute_artist_trade_as_user(
  p_user_id uuid,
  p_side text,
  p_artist_id text,
  p_shares numeric,
  p_market_eligible boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_trade jsonb;
  v_status record;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Trade execution requires service role.' using errcode = '42501';
  end if;
  -- Keep the operator control row stable until this order commits. The API's
  -- earlier readiness check alone cannot protect a pause racing execution.
  perform 1 from public.market_controls where id = true for share;
  select * into v_status from public.get_market_trading_status(p_artist_id);
  if not coalesce(v_status.market_open, false) or coalesce(v_status.artist_halted, true) then
    raise exception '%', coalesce(v_status.reason, 'Trading is currently paused.');
  end if;
  if p_user_id is null then
    raise exception 'A verified user is required.';
  end if;

  if p_side not in ('buy', 'sell', 'short', 'cover') then
    raise exception 'Invalid trade side.';
  end if;

  -- The underlying trade functions deliberately derive ownership from
  -- auth.uid(). Set transaction-local JWT claims so they retain that invariant
  -- while the service-only gateway supplies the verified identity.
  perform set_config('request.jwt.claim.sub', p_user_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', p_user_id::text, 'role', 'authenticated')::text,
    true
  );

  case p_side
    when 'buy' then
      select to_jsonb(trade_row)
      into v_trade
      from public.buy_artist_shares(
        p_artist_id,
        p_shares,
        coalesce(p_market_eligible, false)
      ) as trade_row;
    when 'sell' then
      select to_jsonb(trade_row)
      into v_trade
      from public.sell_artist_shares(
        p_artist_id,
        p_shares,
        coalesce(p_market_eligible, false)
      ) as trade_row;
    when 'short' then
      select to_jsonb(trade_row)
      into v_trade
      from public.short_artist_shares(
        p_artist_id,
        p_shares,
        coalesce(p_market_eligible, false)
      ) as trade_row;
    when 'cover' then
      select to_jsonb(trade_row)
      into v_trade
      from public.cover_artist_shares(
        p_artist_id,
        p_shares,
        coalesce(p_market_eligible, false)
      ) as trade_row;
  end case;

  if v_trade is null then
    raise exception 'Trade did not return a result.';
  end if;

  return v_trade;
end;
$$;
revoke all on function public.execute_artist_trade_as_user(uuid,text,text,numeric,boolean) from public,anon,authenticated;
grant execute on function public.execute_artist_trade_as_user(uuid,text,text,numeric,boolean) to service_role;
notify pgrst, 'reload schema';
commit;
