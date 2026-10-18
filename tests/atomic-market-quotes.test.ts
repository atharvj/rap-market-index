import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";

let db: PGlite;
let date: string;
const functionSignature = "public.persist_market_quote_batch(date,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,boolean)";
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create function auth.role() returns text language sql as $$ select current_setting('request.jwt.claim.role', true) $$;
    create type artist_category as enum ('superstar','mainstream','rising','underground');
    create table public.seasons(id uuid primary key);`);
  const initial = await readFile("supabase/migrations/001_initial_schema.sql", "utf8");
  for (const table of ["artists", "artist_stats", "price_history", "market_signal_snapshots"]) {
    const sql = initial.match(new RegExp(`create table public\\.${table} \\([\\s\\S]*?\\n\\);`))?.[0];
    if (!sql) throw new Error(`Missing fixture schema for ${table}`);
    await db.exec(sql);
  }
  const observations = await readFile("supabase/migrations/006_market_engine.sql", "utf8");
  const ticks = await readFile("supabase/migrations/013_price_ticks.sql", "utf8");
  await db.exec(observations.match(/create table if not exists public\.market_observations \([\s\S]*?\n\);/)![0]);
  await db.exec(ticks.match(/create table if not exists public\.price_ticks \([\s\S]*?\n\);/)![0]);
  await db.exec(`alter table public.price_history add column model_version text;
    alter table public.market_signal_snapshots add column model_version text;`);
  await db.exec(await readFile("supabase/migrations/038_expand_signal_score_range.sql", "utf8"));
  await db.exec(await readFile("supabase/migrations/046_atomic_market_quotes.sql", "utf8"));
  await db.exec(await readFile("supabase/migrations/047_preserve_valuation_boundaries.sql", "utf8"));
  date = (await db.query<{date:string}>("select (now() at time zone 'America/New_York')::date::text as date")).rows[0].date;
  await db.exec(`set request.jwt.claim.role = 'service_role';
    insert into artists(id,name,ticker,current_price,previous_close,category) values ('a','Artist A','AA',100,100,'mainstream'),('b','Artist B','BB',100,100,'mainstream'),('c','Artist C','CC',100,100,'mainstream'),('d','Artist D','DD',100,100,'mainstream');`);
}, 30000);
afterAll(async () => { await db?.close(); });

function batch(id: string, current = 101) {
  const stats = { artist_id: id, streaming_growth: 1, youtube_growth: 0, search_growth: 0, social_growth: 0, news_score: 50, trader_demand: 0 };
  return { stats: [stats], signals: [{ ...stats, source_date: date, model_version: "test", raw_payload: { original: true } }],
    history: [{ artist_id: id, price_date: date, price: current, hype_score: 50, model_version: "test", explanation: "Measured" }],
    quotes: [{ id, current_price: current, previous_close: 100, daily_change_percent: current - 100, hype_score: 50, last_move_explanation: "Measured" }],
    ticks: [{ artist_id: id, price: current, source: "market_run", model_version: "test", raw_payload: {} }],
    state: [{ artist_id: id, source: "market_pricing", metric: "evidence_state", observed_date: date, value: 1, unit: "state",
      raw_payload: { version: 1, runDate: date, modelVersion: "test" } }] };
}
function publish(input: ReturnType<typeof batch>, comparison: number, intraday = false, runDate = date) {
  return db.query<{result:{atomic:boolean;artistCount:number;priceTickCount:number}}>(`select public.persist_market_quote_batch($1::date,$2::jsonb,$3::jsonb,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb,$9) result`,
    [runDate, ...[input.stats,input.signals,input.history,input.quotes,input.ticks,input.state,{[input.quotes[0].id]: comparison}].map(value => JSON.stringify(value)), intraday]);
}
describe("transactional quote publication in PostgreSQL", () => {
  it("commits a coherent quote, chart, original daily snapshot, evidence state and completion", async () => {
    expect((await publish(batch("a"), 100)).rows[0].result).toEqual({ atomic: true, artistCount: 1, priceTickCount: 1 });
    const rows = (await db.query<{price:string;history:string;completions:number}>(`select a.current_price::text price,h.price::text history,
      (select count(*)::int from market_observations where artist_id='a') completions from artists a join price_history h on h.artist_id=a.id where a.id='a'`)).rows[0];
    expect(rows).toEqual({ price: "101.00", history: "101.00", completions: 2 });
  });
  it("rolls back every table after a late tick failure instead of leaving partial prices or daily baselines", async () => {
    await db.exec(`create function reject_test_tick() returns trigger language plpgsql as $$ begin raise exception 'Injected late tick failure'; end $$;
      create trigger reject_test_tick before insert on price_ticks for each row execute function reject_test_tick();`);
    try { await expect(publish(batch("b"), 100)).rejects.toThrow("Injected late tick failure"); }
    finally { await db.exec("drop trigger reject_test_tick on price_ticks; drop function reject_test_tick()"); }
    expect((await db.query<{price:string}>("select current_price::text price from artists where id='b'")).rows[0].price).toBe("100.00");
    for (const table of ["artist_stats","price_history","market_signal_snapshots","market_observations","price_ticks"]) {
      expect((await db.query<{count:number}>(`select count(*)::int count from ${table} where artist_id='b'`)).rows[0].count).toBe(0);
    }
  });
  it("rejects a stale collector instead of overwriting a newer quote", async () => {
    await expect(publish(batch("a", 102), 100)).rejects.toThrow("Quote inputs changed");
  });
  it("keeps the opening signal snapshot intact during intraday publication", async () => {
    const input = batch("a", 102); input.signals[0].raw_payload = { original: false };
    await publish(input, 101, true);
    expect((await db.query<{raw_payload:{original:boolean}}>("select raw_payload from market_signal_snapshots where artist_id='a'")).rows[0].raw_payload.original).toBe(true);
  });
  it("rejects historical publication and mismatched batch identities", async () => {
    await expect(publish(batch("b"), 100, false, "2000-01-01")).rejects.toThrow("current market session");
    const input = batch("b"); input.stats[0].artist_id = "a";
    await expect(publish(input, 100)).rejects.toThrow("mismatched artist identities");
    const wrongTick = batch("b"); wrongTick.ticks[0].price = 900;
    await expect(publish(wrongTick, 100)).rejects.toThrow("Quote tick does not match");
  });
  it("withholds execution from public roles even though it is a security-definer function", async () => {
    for (const role of ["anon", "authenticated"]) {
      expect((await db.query<{allowed:boolean}>("select has_function_privilege($1,$2,'EXECUTE') allowed", [role, functionSignature])).rows[0].allowed).toBe(false);
    }
    await db.exec("set request.jwt.claim.role = 'authenticated'");
    try { await expect(publish(batch("b"), 100)).rejects.toThrow("service role"); }
    finally { await db.exec("set request.jwt.claim.role = 'service_role'"); }
  });
});

function correctionBatch(id: string, before = 101) {
  const input = batch(id, Math.round(before * 1.2 * 100) / 100);
  Object.assign(input.state[0].raw_payload, { priceBeforeRevaluation: before, audienceRevaluation: {
    version: 2, effectiveDate: date, referencePrice: 100, anchorPrice: 120, factor: 1.2,
    calibration: { version: 2, status: "ok", targetPrice: 120, directSourceCount: 2,
      metrics: [{ source: "spotify", key: "spotify_monthly_listeners", value: 50000000 }, { source: "youtube", key: "youtube_subscribers", value: 10000000 }] }
  } });
  return input;
}
describe("permanent valuation boundaries", () => {
  it("recalibrates intraday without replacing original evidence and stamps the exact correction tick", async () => {
    await publish(batch("c"), 100);
    await publish(correctionBatch("c"), 101, true);
    const saved = (await db.query<{factor:string;effective_at:string}>("select factor::text factor,effective_at::text effective_at from market_valuation_boundaries where artist_id='c'")).rows[0];
    expect(Number(saved.factor)).toBe(1.2);
    const check = (await db.query<{snapshot:boolean;aligned:boolean}>(`select
      (select (raw_payload->>'original')::boolean from market_signal_snapshots where artist_id='c') snapshot,
      exists(select 1 from price_ticks t join market_valuation_boundaries b using(artist_id)
        where t.artist_id='c' and t.price=121.2 and t.observed_at=b.effective_at) aligned`)).rows[0];
    expect(check).toEqual({ snapshot: true, aligned: true });
    await publish(correctionBatch("c"), 121.2, true);
    expect((await db.query<{effective_at:string}>("select effective_at::text effective_at from market_valuation_boundaries where artist_id='c'")).rows[0].effective_at).toBe(saved.effective_at);
    expect((await db.query<{price:string}>("select current_price::text price from artists where id='c'")).rows[0].price).toBe("121.20");
  });
  it("cannot silently omit or replace a correction on a later refresh", async () => {
    await expect(publish(batch("c", 122), 121.2, true)).rejects.toThrow("cannot be replaced or omitted");
    const input = correctionBatch("c");
    Object.assign((input.state[0].raw_payload as Record<string, unknown>).audienceRevaluation as object, { factor: 1.3 });
    await expect(publish(input, 121.2, true)).rejects.toThrow("Invalid source-backed");
  });
  it("rolls back the permanent boundary and quote after a later evidence write fails", async () => {
    await db.exec(`create function reject_test_evidence() returns trigger language plpgsql as $$ begin raise exception 'Injected evidence failure'; end $$;
      create trigger reject_test_evidence before insert on market_observations for each row execute function reject_test_evidence();`);
    try { await expect(publish(correctionBatch("d", 100), 100, true)).rejects.toThrow("Injected evidence failure"); }
    finally { await db.exec("drop trigger reject_test_evidence on market_observations; drop function reject_test_evidence()"); }
    expect((await db.query<{count:number}>("select count(*)::int count from market_valuation_boundaries where artist_id='d'")).rows[0].count).toBe(0);
    expect((await db.query<{price:string}>("select current_price::text price from artists where id='d'")).rows[0].price).toBe("100.00");
  });
  it("does not grant browsers or direct service-role table writes access to corrections", async () => {
    for (const role of ["anon", "authenticated", "service_role"]) {
      expect((await db.query<{allowed:boolean}>("select has_table_privilege($1,'public.market_valuation_boundaries','INSERT') allowed",[role])).rows[0].allowed).toBe(false);
    }
  });
});
