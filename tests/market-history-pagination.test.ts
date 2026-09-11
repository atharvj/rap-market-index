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
      range: async (from: number, to: number) => { ranges.push(from); return { data: tables[table].slice(from, to + 1), error: null }; }
    };
    return builder;
  } } as never;
}
