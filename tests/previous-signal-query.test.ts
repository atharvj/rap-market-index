import { afterAll, beforeAll, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table market_signal_snapshots(artist_id text, source_date date, streaming_growth numeric,
      youtube_growth numeric, search_growth numeric, social_growth numeric, news_score numeric,
      trader_demand numeric, raw_payload jsonb, unique(artist_id,source_date));
    insert into market_signal_snapshots
      select 'busy','2026-11-04'::date-i, i,0,0,0,50,0,'{"market_events":{"saved":true},"receptionPricingBaseline":{"bluesky":-8}}'
      from generate_series(0,1100) i;
    insert into market_signal_snapshots values ('older','2023-01-01',9,0,0,0,50,0,'{}'),
      ('busy','2026-11-05',999,0,0,0,50,0,'{}'),('unrequested','2026-11-04',999,0,0,0,50,0,'{}');`);
  await db.exec(await readFile("supabase/migrations/048_latest_signal_baselines.sql", "utf8"));
});
afterAll(async () => { await db?.close(); });
it("selects one actual previous row per artist despite large and uneven histories", async () => {
  const rows = (await db.query<{artist_id:string;streaming_growth:string;event_pricing:unknown;reception_pricing:unknown}>(
    "select * from get_previous_market_signals($1,$2)", [["busy","older","busy","new-listing"],"2026-11-05"])).rows;
  expect(rows.map(r => r.artist_id)).toEqual(["busy","older"]);
  expect(rows.map(r => Number(r.streaming_growth))).toEqual([0,9]);
  expect(rows[0].event_pricing).toEqual({ saved: true });
  expect(rows[0].reception_pricing).toEqual({ bluesky: -8 });
});
it("allows only service role to execute the private lookup", async () => {
  for (const role of ["anon","authenticated","service_role"]) {
    const row = (await db.query<{allowed:boolean}>("select has_function_privilege($1,'get_previous_market_signals(text[],date)','EXECUTE') allowed",[role])).rows[0];
    expect(row.allowed).toBe(role === "service_role");
  }
});
