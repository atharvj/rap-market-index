import { describe, expect, it } from "vitest";
import { loadChartAdjustments } from "@/server/market/chart-adjustments";

const date = "2026-09-10";
const boundary = { version: 2, effectiveDate: date, referencePrice: 10, anchorPrice: 30, factor: 3 };

function database(record: object = boundary, tick: object | null = { observed_at: "2026-09-11T03:14:54.184952Z" }) {
  const filters: unknown[][] = [];
  const db = { from(table: string) {
    const builder = {
      select: () => builder, order: () => builder, limit: () => builder,
      in: (...args: unknown[]) => { filters.push([table, "in", ...args]); return builder; },
      eq: (...args: unknown[]) => { filters.push([table, "eq", ...args]); return builder; },
      gte: (...args: unknown[]) => { filters.push([table, "gte", ...args]); return builder; },
      lt: (...args: unknown[]) => { filters.push([table, "lt", ...args]); return builder; },
      lte: (...args: unknown[]) => { filters.push([table, "lte", ...args]); return builder; },
      not: () => builder,
      contains: (...args: unknown[]) => { filters.push([table, "contains", ...args]); return builder; },
      range: async () => ({ data: [{ artist_id: "example", source_date: date, model_version: "v34", raw_payload: { audienceRevaluation: record, priceBeforeRevaluation: 10.1 } }], error: null }),
      maybeSingle: async () => ({ data: tick, error: null })
    };
    return builder;
  } };
  return { supabase: db as never, filters };
}

describe("stored chart corrections", () => {
  it("resolves legacy timing from the matching recorded tick and market timezone", async () => {
    const { supabase, filters } = database();
    const result = await loadChartAdjustments({ supabase, artistIds: ["example"], earliestDate: "2026-09-09", intraday: true });
    expect(result.example).toEqual([{ effectiveDate: date, effectiveAt: "2026-09-11T03:14:54.184952Z", factor: 3 }]);
    expect(filters).toContainEqual(["price_ticks", "eq", "price", 30.3]);
    expect(filters).toContainEqual(["price_ticks", "contains", "raw_payload", { runDate: date, intraday: false }]);
    expect(filters).toContainEqual(["price_ticks", "gte", "observed_at", "2026-09-10T04:00:00.000Z"]);
    expect(filters).toContainEqual(["price_ticks", "lt", "observed_at", "2026-09-11T04:00:00.000Z"]);
    expect(filters).toContainEqual(["market_signal_snapshots", "gte", "source_date", "2026-09-09"]);
  });

  it("does not invent a cutoff if the matching correction tick is unavailable", async () => {
    await expect(loadChartAdjustments({ ...database(boundary, null), artistIds: ["example"], intraday: true })).rejects.toThrow(/could not be verified/);
  });

  it("rejects a corrupted saved factor", async () => {
    expect(await loadChartAdjustments({ ...database({ ...boundary, factor: 99 }), artistIds: ["example"] })).toEqual({});
  });

  it("reads daily adjustments without requiring intraday data", async () => {
    expect(await loadChartAdjustments({ ...database(boundary, null), artistIds: ["example"] })).toEqual({ example: [{ effectiveDate: date, factor: 3 }] });
  });
});
