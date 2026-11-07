import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { loadLatestSourceObservationTimes } from "@/server/market/supabase-repository";

let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table market_observations(artist_id text, source text, metric text, observed_date date, observed_at timestamptz);
    insert into market_observations select 'busy','media_rss','coverage','2026-11-04'::date-i,
      '2026-11-04T12:00:00Z'::timestamptz-i*interval '1 day' from generate_series(0,1100) i;
    insert into market_observations values
      ('quiet','media_rss','coverage','2026-11-01','2026-11-01T12:00:00Z'),
      ('busy','media_rss','other_metric','2026-11-04','2026-11-04T13:00:00Z'),
      ('busy','media_rss','coverage','2026-11-06','2026-11-06T12:00:00Z'),
      ('busy','youtube_uploads','coverage','2026-11-05','2026-11-05T12:00:00Z'),
      ('unrequested','media_rss','coverage','2026-11-05','2026-11-05T12:00:00Z');`);
  await db.exec(await readFile("supabase/migrations/051_latest_source_observation_times.sql", "utf8"));
  await db.exec(await readFile("supabase/migrations/052_plan_source_lookups_for_actual_parameters.sql", "utf8"));
});
afterAll(async () => { await db?.close(); });

it("returns one latest in-window source timestamp for each artist with uneven histories", async () => {
  const rows = (await db.query<{ artist_id: string; observed_at: Date }>(
    "select * from get_latest_source_observation_times($1,$2,$3,$4)",
    [["busy", "quiet", "busy", "missing"], "media_rss", "2026-11-01", "2026-11-05"])).rows;
  expect(rows.map(row => [row.artist_id, new Date(row.observed_at).toISOString()])).toEqual([
    ["busy", "2026-11-04T13:00:00.000Z"], ["quiet", "2026-11-01T12:00:00.000Z"]
  ]);
});

it("restricts source timing lookup to the service role", async () => {
  for (const role of ["anon", "authenticated", "service_role"]) {
    const row = (await db.query<{ allowed: boolean }>(
      "select has_function_privilege($1,'get_latest_source_observation_times(text[],text,date,date)','EXECUTE') allowed", [role])).rows[0];
    expect(row.allowed).toBe(role === "service_role");
  }
});

it("reads the bounded lookup and fails instead of assuming an unsuccessful read means no coverage", async () => {
  const rpc = vi.fn().mockResolvedValue({ data: [{ artist_id: "quiet", observed_at: "2026-11-01T12:00:00Z" }], error: null });
  const options = { supabase: { rpc } as never, artistIds: ["quiet"], source: "media_rss", runDate: "2026-11-05", lookbackDays: 3 };
  expect(await loadLatestSourceObservationTimes(options)).toEqual({ quiet: "2026-11-01T12:00:00Z" });
  expect(rpc).toHaveBeenCalledWith("get_latest_source_observation_times", {
    p_artist_ids: ["quiet"], p_source: "media_rss", p_start_date: "2026-11-02", p_end_date: "2026-11-05"
  });
  rpc.mockResolvedValueOnce({ data: null, error: { message: "statement timeout" } });
  await expect(loadLatestSourceObservationTimes(options)).rejects.toThrow("Could not load latest media_rss observation times");
  rpc.mockClear();
  expect(await loadLatestSourceObservationTimes({ ...options, artistIds: [] })).toEqual({});
  expect(rpc).not.toHaveBeenCalled();
});


it("keeps source and date isolation across repeated calls from a generic prepared RPC", async () => {
  await db.exec("set plan_cache_mode = force_generic_plan; prepare source_lookup(text[],text,date,date) as select * from get_latest_source_observation_times($1,$2,$3,$4)");
  try {
    for (let i = 0; i < 8; i++) {
      const rows = (await db.query<{ artist_id: string; observed_at: Date }>(
        "execute source_lookup(array['busy','quiet','busy'],'youtube_uploads','2026-11-05','2026-11-05')")).rows;
      expect(rows.map(row => [row.artist_id, new Date(row.observed_at).toISOString()])).toEqual([["busy", "2026-11-05T12:00:00.000Z"]]);
    }
    const rows = (await db.query<{ artist_id: string }>(
      "execute source_lookup(array['busy','quiet'],'media_rss','2026-11-01','2026-11-01')")).rows;
    expect(rows.map(row => row.artist_id)).toEqual(["busy", "quiet"]);
    expect((await db.query("execute source_lookup(array['busy'],'not-a-source','2026-11-01','2026-11-05')")).rows).toEqual([]);
  } finally { await db.exec("deallocate source_lookup; reset plan_cache_mode"); }
});
