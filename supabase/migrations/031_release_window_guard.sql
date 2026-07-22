begin;

update public.market_controls
set day_change_reset = '12:01 AM ET'
where id = true;

create or replace function public.get_market_trading_status(
  p_artist_id text default null
)
returns table (
  trading_mode text,
  market_open boolean,
  market_impact_enabled boolean,
  artist_halted boolean,
  reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_control public.market_controls%rowtype;
  v_halt public.artist_trading_halts%rowtype;
  v_market_open boolean;
  v_impact_enabled boolean;
  v_artist_halted boolean := false;
  v_reason text;
  v_pending_event_title text;
  v_latest_quote_at timestamptz;
  v_market_date date := (now() at time zone 'America/New_York')::date;
  v_market_midnight timestamptz;
begin
  v_market_midnight := v_market_date::timestamp at time zone 'America/New_York';

  select mc.*
  into v_control
  from public.market_controls as mc
  where mc.id = true;

  if not found then
    v_control.trading_mode := 'continuous';
    v_control.allow_trading := true;
    v_control.allow_market_impact := true;
    v_control.status_note := 'Continuous virtual trading is open.';
  end if;

  v_market_open := v_control.trading_mode = 'continuous' and v_control.allow_trading = true;
  v_impact_enabled := v_market_open and v_control.allow_market_impact = true;
  v_reason := v_control.status_note;

  if not v_market_open then
    v_reason := coalesce(nullif(v_control.status_note, ''), 'Trading is currently paused.');
  elsif not exists (
    select 1
    from public.market_update_runs as run
    where run.run_date = v_market_date
      and run.source = 'core'
      and run.status = 'succeeded'
      and (
        select count(*)
        from public.price_history as history
        where history.price_date = v_market_date
      ) >= (
        select count(*)
        from public.artists as artist
        where artist.is_active = true
      )
  ) then
    v_market_open := false;
    v_impact_enabled := false;
    v_reason := 'Trading is paused while today''s release scan and source-based repricing finish.';
  end if;

  if p_artist_id is not null then
    select h.*
    into v_halt
    from public.artist_trading_halts as h
    where h.artist_id = p_artist_id
      and h.is_halted = true
      and h.starts_at <= now()
      and (h.ends_at is null or h.ends_at > now());

    if found then
      v_artist_halted := true;
      v_market_open := false;
      v_impact_enabled := false;
      v_reason := coalesce(nullif(v_halt.reason, ''), 'Trading is halted for this artist.');
    elsif v_market_open then
      select max(pt.observed_at)
      into v_latest_quote_at
      from public.price_ticks as pt
      where pt.artist_id = p_artist_id
        and pt.source = 'market_run';

      select e.title
      into v_pending_event_title
      from public.market_events as e
      where e.artist_id = p_artist_id
        and e.confidence >= 0.65
        and abs(e.impact_score) >= 35
        and (
          e.created_at > coalesce(v_latest_quote_at, '-infinity'::timestamptz)
          or (
            e.event_type = 'release'
            and e.event_date = v_market_date
            and coalesce(v_latest_quote_at, '-infinity'::timestamptz) < v_market_midnight
          )
        )
      order by e.created_at desc
      limit 1;

      if found then
        v_market_open := false;
        v_impact_enabled := false;
        v_reason := 'Trading is temporarily paused while a newly detected catalyst is incorporated into the quote.';
      end if;
    end if;
  end if;

  return query
  select
    coalesce(v_control.trading_mode, 'continuous'),
    v_market_open,
    v_impact_enabled,
    v_artist_halted,
    v_reason;
end;
$$;

revoke all on function public.get_market_trading_status(text) from public, anon, authenticated;
grant execute on function public.get_market_trading_status(text) to anon, authenticated, service_role;

commit;

notify pgrst, 'reload schema';
