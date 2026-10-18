-- Publish quotes, charts, input state and completion together, or roll them all
-- back. Service role only; no historical repricing and no arbitrary SQL input.
begin;
-- Store one-time valuation corrections separately from original daily evidence.
create table public.market_valuation_boundaries (
  artist_id text not null references public.artists(id) on delete cascade,
  effective_date date not null,
  effective_at timestamptz not null,
  model_version text not null,
  reference_price numeric not null check (reference_price > 0 and reference_price <= 1000000000),
  anchor_price numeric not null check (anchor_price > 0 and anchor_price <= 1000000000),
  factor numeric not null check (factor > 0 and factor <= 1000000000),
  calibration jsonb not null check (jsonb_typeof(calibration) = 'object'),
  primary key (artist_id, effective_date),
  check (abs(factor - anchor_price / reference_price) < 0.000001)
);
alter table public.market_valuation_boundaries enable row level security;
revoke all on public.market_valuation_boundaries from public, anon, authenticated, service_role;
grant select on public.market_valuation_boundaries to service_role;

create or replace function public.persist_market_quote_batch(
  p_run_date date, p_stats jsonb, p_signals jsonb, p_history jsonb,
  p_quotes jsonb, p_ticks jsonb, p_pricing_state jsonb,
  p_comparison_prices jsonb, p_intraday boolean default false
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_count integer;
  v_tick_count integer;
  v_locked integer;
  v_completed_at timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Market quote publication requires service role.' using errcode = '42501';
  end if;
  if p_run_date is distinct from (now() at time zone 'America/New_York')::date then
    raise exception 'Only the current market session can publish live quotes.';
  end if;
  if p_intraday is null or jsonb_typeof(p_quotes) is distinct from 'array' or
    jsonb_typeof(p_stats) is distinct from 'array' or jsonb_typeof(p_signals) is distinct from 'array' or
    jsonb_typeof(p_history) is distinct from 'array' or jsonb_typeof(p_ticks) is distinct from 'array' or
    jsonb_typeof(p_pricing_state) is distinct from 'array' or jsonb_typeof(p_comparison_prices) is distinct from 'object' then
    raise exception 'Malformed market quote batch.';
  end if;
  v_count := jsonb_array_length(p_quotes);
  if v_count < 1 or v_count > 100 or
    (select count(distinct row->>'id') from jsonb_array_elements(p_quotes) row) <> v_count then
    raise exception 'Market quote batch requires 1 to 100 distinct artists.';
  end if;
  if jsonb_array_length(p_stats) <> v_count or jsonb_array_length(p_history) <> v_count or
    jsonb_array_length(p_pricing_state) <> v_count or (not p_intraday and jsonb_array_length(p_signals) <> v_count) then
    raise exception 'Quote, stats, history and evidence coverage must match.';
  end if;
  -- Every required table receives exactly one row for each quoted artist.
  if exists (
    select 1 from (select row->>'id' id from jsonb_array_elements(p_quotes) row) q
    where (select count(*) from jsonb_array_elements(p_stats) row where row->>'artist_id' = q.id) <> 1 or
      (select count(*) from jsonb_array_elements(p_history) row where row->>'artist_id' = q.id) <> 1 or
      (select count(*) from jsonb_array_elements(p_pricing_state) row where row->>'artist_id' = q.id) <> 1 or
      (not p_intraday and (select count(*) from jsonb_array_elements(p_signals) row where row->>'artist_id' = q.id) <> 1)
  ) then raise exception 'Market quote batch contains mismatched artist identities.'; end if;
  if exists (select 1 from jsonb_array_elements(p_ticks) row where not exists
    (select 1 from jsonb_array_elements(p_quotes) quote where quote->>'id' = row->>'artist_id')) then
    raise exception 'A quote tick references an artist outside its batch.';
  end if;
  -- Serialize publication, then lock artist rows also used by the trade RPCs.
  perform pg_advisory_xact_lock(hashtextextended('rmi:market-quote-publication', 0));
  perform 1 from public.artists a where a.id in
    (select row->>'id' from jsonb_array_elements(p_quotes) row) order by a.id for update;
  get diagnostics v_locked = row_count;
  if v_locked <> v_count or exists (
    select 1 from public.artists a join jsonb_array_elements(p_quotes) row on a.id = row->>'id'
    where not a.is_active or not (p_comparison_prices ? a.id) or
      a.current_price is distinct from (p_comparison_prices->>a.id)::numeric
  ) then raise exception 'Quote inputs changed during collection; retry with fresh prices.' using errcode = '40001'; end if;
  if exists (
    select 1 from jsonb_to_recordset(p_quotes) as q(id text, current_price numeric, previous_close numeric, daily_change_percent numeric, hype_score numeric)
    where q.current_price is null or q.current_price < 1 or q.current_price > 1000000000 or
      q.previous_close is null or q.previous_close <= 0 or q.previous_close > 1000000000 or
      q.daily_change_percent is null or abs(q.daily_change_percent - (q.current_price / q.previous_close - 1) * 100) > 0.000001 or
      q.hype_score is null or q.hype_score < 1 or q.hype_score > 100
  ) then raise exception 'Invalid market quote values.'; end if;
  if exists (
    select 1 from jsonb_populate_recordset(null::public.price_history, p_history) h
    join jsonb_to_recordset(p_quotes) as q(id text, current_price numeric) on q.id = h.artist_id
    where h.price is distinct from q.current_price or h.price_date is distinct from p_run_date or h.model_version is null
  ) then raise exception 'Quote history does not match the publication.'; end if;
  if exists (
    select 1 from jsonb_populate_recordset(null::public.price_ticks, p_ticks) tick
    join jsonb_to_recordset(p_quotes) as q(id text, current_price numeric) on q.id = tick.artist_id
    where tick.price is distinct from q.current_price or tick.source is distinct from 'market_run' or
      not exists (select 1 from jsonb_populate_recordset(null::public.price_history, p_history) h
        where h.artist_id = tick.artist_id and h.model_version = tick.model_version)
  ) then raise exception 'Quote tick does not match the publication.'; end if;
  if exists (
    select 1 from jsonb_populate_recordset(null::public.market_observations, p_pricing_state) state
    where state.source is distinct from 'market_pricing' or state.metric is distinct from 'evidence_state' or
      state.observed_date is distinct from p_run_date or state.raw_payload->>'runDate' is distinct from p_run_date::text or
      state.raw_payload->>'version' is distinct from '1' or not exists
        (select 1 from jsonb_populate_recordset(null::public.price_history, p_history) h
          where h.artist_id = state.artist_id and h.model_version = state.raw_payload->>'modelVersion')
  ) then raise exception 'Invalid pricing evidence identity.'; end if;

  if exists (
    select 1 from jsonb_array_elements(p_pricing_state) state
    where state->'raw_payload'->'audienceRevaluation' is not null and
      jsonb_typeof(state->'raw_payload'->'audienceRevaluation') not in ('null', 'object')
  ) then raise exception 'Malformed valuation correction.'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_pricing_state) state
    cross join lateral (select state->'raw_payload'->'audienceRevaluation' as r) boundary
    join jsonb_to_recordset(p_quotes) as q(id text, current_price numeric, previous_close numeric) on q.id=state->>'artist_id'
    where jsonb_typeof(r) = 'object' and (
      r->>'version' is distinct from '2' or r->>'effectiveDate' is distinct from p_run_date::text or
      (r->>'referencePrice')::numeric is distinct from q.previous_close or
      coalesce((r->>'anchorPrice')::numeric, 0) <= 0 or coalesce((r->>'factor')::numeric, 0) <= 0 or
      abs((r->>'factor')::numeric - (r->>'anchorPrice')::numeric / (r->>'referencePrice')::numeric) > 0.000001 or
      jsonb_typeof(r->'calibration') is distinct from 'object' or
      r->'calibration'->>'version' is distinct from '2' or r->'calibration'->>'status' is distinct from 'ok' or
      (r->'calibration'->>'targetPrice')::numeric is distinct from (r->>'anchorPrice')::numeric or
      coalesce((r->'calibration'->>'directSourceCount')::numeric, 0) < 2 or
      jsonb_typeof(r->'calibration'->'metrics') is distinct from 'array' or
      (select count(distinct metric->>'source') from jsonb_array_elements(r->'calibration'->'metrics') metric
        where metric->>'source' in ('spotify','youtube','lastfm') and (metric->>'value')::numeric > 0) < 2 or
      not exists (select 1 from jsonb_array_elements(r->'calibration'->'metrics') metric
        where metric->>'key'='spotify_monthly_listeners' and metric->>'source'='spotify' and (metric->>'value')::numeric > 0) or
      coalesce((state->'raw_payload'->>'priceBeforeRevaluation')::numeric, 0) <= 0 or
      abs(q.current_price - round((state->'raw_payload'->>'priceBeforeRevaluation')::numeric * (r->>'factor')::numeric, 2)) > 0.000001
    )
  ) then raise exception 'Invalid source-backed valuation correction.'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_pricing_state) state
    join public.market_valuation_boundaries saved on saved.artist_id=state->>'artist_id' and saved.effective_date=p_run_date
    where jsonb_typeof(state->'raw_payload'->'audienceRevaluation') is distinct from 'object' or
      saved.reference_price is distinct from (state->'raw_payload'->'audienceRevaluation'->>'referencePrice')::numeric or
      saved.anchor_price is distinct from (state->'raw_payload'->'audienceRevaluation'->>'anchorPrice')::numeric or
      abs(saved.factor - (state->'raw_payload'->'audienceRevaluation'->>'factor')::numeric) > 0.000001
  ) then raise exception 'An existing valuation correction cannot be replaced or omitted.'; end if;

  insert into public.artist_stats(artist_id, streaming_growth, youtube_growth, search_growth, social_growth, news_score, trader_demand)
    select artist_id, streaming_growth, youtube_growth, search_growth, social_growth, news_score, trader_demand
    from jsonb_populate_recordset(null::public.artist_stats, p_stats)
    on conflict(artist_id) do update set streaming_growth = excluded.streaming_growth, youtube_growth = excluded.youtube_growth,
      search_growth = excluded.search_growth, social_growth = excluded.social_growth, news_score = excluded.news_score, trader_demand = excluded.trader_demand;
  if not p_intraday then
    if exists (select 1 from jsonb_populate_recordset(null::public.market_signal_snapshots, p_signals) s where s.source_date is distinct from p_run_date) then
      raise exception 'Invalid daily evidence date.';
    end if;
    insert into public.market_signal_snapshots(artist_id, source_date, streaming_growth, youtube_growth, search_growth, social_growth, news_score, trader_demand, model_version, raw_payload)
      select artist_id, source_date, streaming_growth, youtube_growth, search_growth, social_growth, news_score, trader_demand, model_version, raw_payload
      from jsonb_populate_recordset(null::public.market_signal_snapshots, p_signals)
      on conflict(artist_id, source_date) do update set streaming_growth = excluded.streaming_growth, youtube_growth = excluded.youtube_growth,
        search_growth = excluded.search_growth, social_growth = excluded.social_growth, news_score = excluded.news_score,
        trader_demand = excluded.trader_demand, model_version = excluded.model_version, raw_payload = excluded.raw_payload;
  end if;
  insert into public.price_history(artist_id, price_date, price, hype_score, model_version, explanation)
    select artist_id, price_date, price, hype_score, model_version, explanation from jsonb_populate_recordset(null::public.price_history, p_history)
    on conflict(artist_id, price_date) do update set price = excluded.price, hype_score = excluded.hype_score,
      model_version = excluded.model_version, explanation = excluded.explanation;
  update public.artists a set current_price = q.current_price, previous_close = q.previous_close,
    daily_change_percent = q.daily_change_percent, hype_score = q.hype_score, last_move_explanation = q.last_move_explanation
    from jsonb_to_recordset(p_quotes) as q(id text, current_price numeric, previous_close numeric, daily_change_percent numeric, hype_score numeric, last_move_explanation text)
    where a.id = q.id;
  v_completed_at := clock_timestamp();
  insert into public.price_ticks(artist_id, price, source, model_version, raw_payload, observed_at)
    select artist_id, price, source, model_version, raw_payload, v_completed_at from jsonb_populate_recordset(null::public.price_ticks, p_ticks);
  get diagnostics v_tick_count = row_count;
  insert into public.market_valuation_boundaries(artist_id, effective_date, effective_at, model_version, reference_price, anchor_price, factor, calibration)
    select state->>'artist_id', p_run_date, v_completed_at, state->'raw_payload'->>'modelVersion',
      (r->>'referencePrice')::numeric, (r->>'anchorPrice')::numeric, (r->>'factor')::numeric, r->'calibration'
    from jsonb_array_elements(p_pricing_state) state
    cross join lateral (select state->'raw_payload'->'audienceRevaluation' as r) boundary
    where jsonb_typeof(r)='object'
    on conflict(artist_id,effective_date) do nothing;
  insert into public.market_observations(artist_id, source, metric, observed_date, observed_at, value, unit, raw_payload)
    select artist_id, source, metric, observed_date, v_completed_at, value, unit, raw_payload || jsonb_build_object('atomic', true) ||
      case when jsonb_typeof(raw_payload->'audienceRevaluation')='object' then
        jsonb_build_object('audienceRevaluation', raw_payload->'audienceRevaluation' || jsonb_build_object('effectiveAt',
          (select effective_at from public.market_valuation_boundaries b where b.artist_id=state.artist_id and b.effective_date=p_run_date)))
      else '{}'::jsonb end
    from jsonb_populate_recordset(null::public.market_observations, p_pricing_state) state
    on conflict(artist_id, source, metric, observed_date) do update set observed_at = excluded.observed_at, value = excluded.value, unit = excluded.unit, raw_payload = excluded.raw_payload;
  insert into public.market_observations(artist_id, source, metric, observed_date, observed_at, value, unit, raw_payload)
    select row->>'artist_id', 'market_refresh', 'completed', p_run_date, v_completed_at, 1, 'refresh',
      jsonb_build_object('modelVersion', row->'raw_payload'->>'modelVersion', 'intraday', p_intraday, 'atomic', true)
    from jsonb_array_elements(p_pricing_state) row
    on conflict(artist_id, source, metric, observed_date) do update set observed_at = excluded.observed_at, value = excluded.value, raw_payload = excluded.raw_payload;
  return jsonb_build_object('artistCount', v_count, 'priceTickCount', v_tick_count, 'atomic', true);
end;
$$;

revoke all on function public.persist_market_quote_batch(date, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.persist_market_quote_batch(date, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, boolean) to service_role;
notify pgrst, 'reload schema';
commit;
