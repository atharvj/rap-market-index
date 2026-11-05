import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table market_controls(id boolean, trading_mode text, allow_trading boolean, allow_market_impact boolean, status_note text);
    create table artists(id text primary key,is_active boolean);
    create table price_history(artist_id text,price_date date);
    create table market_update_runs(run_date date,source text,status text);
    create table artist_trading_halts(artist_id text,is_halted boolean,starts_at timestamptz,ends_at timestamptz,reason text);
    create table price_ticks(artist_id text,source text,observed_at timestamptz);
    create table market_events(artist_id text,title text,confidence numeric,impact_score numeric,created_at timestamptz,event_type text,event_date date);`);
  await db.exec(await readFile("supabase/migrations/049_strict_market_opening.sql","utf8"));
});
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec(`truncate market_controls,artists,price_history,market_update_runs,artist_trading_halts,price_ticks,market_events;
    insert into market_controls values(true,'continuous',true,true,'Open');
    insert into artists values('a',true),('b',true),('inactive',false);
    insert into market_update_runs values((now() at time zone 'America/New_York')::date,'core','succeeded');`);
});
async function status() { return (await db.query<{market_open:boolean;reason:string}>("select * from get_market_trading_status(null)")).rows[0]; }
it("does not replace a missing active close with an inactive close", async () => {
  await db.exec(`insert into price_history select id,(now() at time zone 'America/New_York')::date from artists where id in ('a','inactive')`);
  expect((await status()).market_open).toBe(false);
  await db.exec(`insert into price_history values('b',(now() at time zone 'America/New_York')::date)`);
  expect((await status()).market_open).toBe(true);
});
it("fails closed with no controls or no active market", async () => {
  await db.exec("delete from market_controls"); expect((await status()).market_open).toBe(false);
  await db.exec("insert into market_controls values(true,'continuous',true,true,'Open');delete from artists");
  expect((await status()).market_open).toBe(false);
});
