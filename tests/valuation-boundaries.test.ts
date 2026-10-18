import { describe, expect, it } from "vitest";
import { loadValuationBoundaries } from "@/server/market/valuation-boundaries";
import { adjustPriceHistory } from "@/lib/adjusted-price-history";
const date = "2026-10-18", time = "2026-10-18T23:00:00.000Z";
const record = { version: 2, effectiveDate: date, referencePrice: 200, anchorPrice: 140, factor: 0.7 };
function client(saved: unknown[] = [], legacy: unknown[] = [], fail = false) {
  return { from(table: string) {
    const query = { select: () => query, in: () => query, lte: () => query, gte: () => query, not: () => query, order: () => query,
      range: async () => ({ data: table === "market_valuation_boundaries" ? saved : legacy,
        error: fail && table === "market_valuation_boundaries" ? { message: "unavailable" } : null }) };
    return query;
  } } as never;
}
const saved = { artist_id: "a", effective_date: date, effective_at: time, model_version: "v47",
  reference_price: 200, anchor_price: 140, factor: 0.7, calibration: {} };
describe("durable valuation correction loading", () => {
  it("reads permanent corrections without requiring an overwritten daily snapshot", async () => {
    const rows = await loadValuationBoundaries({ supabase: client([saved]), artistIds: ["a"], endDate: date });
    expect(rows).toHaveLength(1); expect(rows[0].record).toMatchObject({ factor: 0.7, effectiveAt: time });
    const history = adjustPriceHistory([{ date: "2026-10-18T22:00:00Z", price: 200 }, { date: time, price: 140 }], rows.map(r => r.record), "intraday");
    expect(history.map(point => point.price)).toEqual([140,140]);
  });
  it("does not apply the same correction twice when a legacy snapshot also has it", async () => {
    const rows = await loadValuationBoundaries({ supabase: client([saved],[{ artist_id: "a", source_date: date, model_version: "v47", raw_payload: { audienceRevaluation: record } }]), artistIds: ["a"], endDate: date });
    expect(rows).toHaveLength(1); expect(rows[0].record.effectiveAt).toBe(time);
  });
  it("fails closed instead of serving quotes on a conflicting correction scale", async () => {
    await expect(loadValuationBoundaries({ supabase: client([{ ...saved, factor: 0.8 }]), artistIds: ["a"], endDate: date })).rejects.toThrow("verify a permanent");
    await expect(loadValuationBoundaries({ supabase: client([saved],[],true), artistIds: ["a"], endDate: date })).rejects.toThrow("permanent valuation");
  });
});
