import { describe, expect, it } from "vitest";
import { loadObservationBaselines, loadPriceTrendContexts } from "@/server/market/supabase-repository";

describe("complete pricing history", () => {
  it("reads the whole 30-day source window beyond the backend row cap", async () => {
    const rows = Array.from({ length: 30 }, (_, day) => Array.from({ length: 50 }, (_, index) => ({
      artist_id: `artist-${index}`, metric: "listeners", value: 10000 + (30 - day) * 100,
      observed_date: new Date(Date.UTC(2026, 8, 4 - day)).toISOString().slice(0, 10),
      observed_at: new Date(Date.UTC(2026, 8, 4 - day)).toISOString()
    }))).flat();
    const ranges: number[] = [];
    const supabase = mockDatabase({ market_observations: rows }, ranges);
    const result = await loadObservationBaselines({ supabase, artistIds: Array.from({ length: 50 }, (_, index) => `artist-${index}`), source: "lastfm", metrics: ["listeners"], beforeDate: "2026-09-05", lookbackDays: 30, strategy: "latest" });
    expect(ranges).toEqual([0, 1000]);
    expect(result["artist-49"].listeners).toBe(13000);
    expect(result["artist-49"].listeners__recent_rate_samples).toBeGreaterThan(20);
  });

  it("uses all recent daily closes, including dates after the first thousand rows", async () => {
    const history = Array.from({ length: 30 }, (_, day) => Array.from({ length: 50 }, (_, index) => ({
      artist_id: `artist-${index}`, price: 20 + day,
      price_date: new Date(Date.UTC(2026, 7, 6 + day)).toISOString().slice(0, 10)
    }))).flat();
    const result = await loadPriceTrendContexts({ supabase: mockDatabase({ price_history: history, market_signal_snapshots: [] }, []), artistIds: Array.from({ length: 50 }, (_, index) => `artist-${index}`), runDate: "2026-09-05" });
    expect(result["artist-49"].sampleCount).toBe(30);
    expect(result["artist-49"].latestPriceDate).toBe("2026-09-04");
  });
});

function mockDatabase(tables: Record<string, unknown[]>, ranges: number[]) {
  return { from(table: string) {
    const builder = {
      select: () => builder, in: () => builder, eq: () => builder, gte: () => builder,
      lt: () => builder, lte: () => builder, not: () => builder, order: () => builder,
      range: async (from: number, to: number) => { ranges.push(from); return { data: (tables[table] ?? []).slice(from, to + 1), error: null }; }
    };
    return builder;
  } } as never;
}

it("recovers an artist's older previous close beyond a full backend page", async () => {
  const { loadPreviousClosePrices } = await import("@/server/market/supabase-repository");
  const queries: string[][] = [];
  const supabase = { from() { let ids: string[] = []; const builder = { select: () => builder,
    in: (_: string, values: string[]) => { ids = values; queries.push(values); return builder; }, lt: () => builder, order: () => builder,
    range: async () => ({ error: null, data: ids.includes("newer") ? Array.from({ length: 1000 }, () => ({ artist_id: "newer", price: 100 })) : [{ artist_id: "older", price: 73 }] }) }; return builder; } } as never;
  expect(await loadPreviousClosePrices({ supabase, artistIds: ["newer", "older", "new-listing"], runDate: "2026-10-15" })).toEqual({ newer: 100, older: 73 });
  expect(queries).toEqual([["newer", "older", "new-listing"], ["older", "new-listing"]]);
});

it("retries a canceled baseline read once and still rejects a repeated failure", async () => {
  let calls = 0;
  const base = mockDatabase({ market_observations: [] }, []) as unknown as { from(table: string): unknown };
  const make = (alwaysFail: boolean) => ({ from() { const builder = base.from("market_observations") as unknown as Record<string, unknown>;
    builder.range = async () => { calls++; return alwaysFail || calls === 1 ? { data: null, error: { code: "57014", message: "statement timeout" } } : { data: [], error: null }; }; return builder; } }) as never;
  const options = { artistIds: ["a"], source: "youtube_comments", metrics: ["comment_count"], beforeDate: "2026-10-15", lookbackDays: 7 };
  expect(await loadObservationBaselines({ ...options, supabase: make(false) })).toEqual({}); expect(calls).toBe(2);
  calls = 0;
  await expect(loadObservationBaselines({ ...options, supabase: make(true) })).rejects.toThrow("youtube_comments observation baselines"); expect(calls).toBe(2);
});

it("rehydrates missing Apple keys from same-day saved totals without borrowing an older market date", async () => {
  const { loadLatestObservationPayloads } = await import("@/server/market/supabase-repository");
  const stamp = "2026-10-15T06:00:00Z", partial = { runDate: "2026-10-15", scores: { gb: 30 }, chartUpdatedAt: { gb: stamp } };
  const rows = [
    { artist_id: "a", observed_date: "2026-10-15", raw_payload: partial },
    { artist_id: "a", observed_date: "2026-10-15", raw_payload: { ...partial, scores: { us: 80, gb: 31 }, chartUpdatedAt: { us: stamp, gb: stamp } } },
    { artist_id: "b", observed_date: "2026-10-15", raw_payload: partial },
    { artist_id: "b", observed_date: "2026-10-14", raw_payload: { runDate: "2026-10-14", scores: { us: 99 }, chartUpdatedAt: { us: stamp } } }
  ];
  const result = await loadLatestObservationPayloads({ supabase: mockDatabase({ market_observations: rows }, []), artistIds: ["a", "b"], source: "apple_charts", metric: ["chart_snapshot", "chart_points"], beforeDate: "2026-10-16", lookbackDays: 3 });
  expect(result.a.scores).toEqual({ gb: 30, us: 80 }); expect(result.b.scores).toEqual({ gb: 30 });
});
