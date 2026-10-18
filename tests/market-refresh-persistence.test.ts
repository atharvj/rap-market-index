import { describe, expect, it } from "vitest";
import { persistMarketUpdates } from "@/server/market/supabase-repository";
const update = { artistId: "artist", ticker: "ART", currentPrice: 50, previousClose: 50, dailyChangePercent: 0, hypeScore: 50, signalDelta: 0,
  modelVersion: "test", stats: {}, rawPayload: {}, explanation: "Unchanged" };
function setup(failTable?: string, comparisonPrice = 50, pricingState = false) {
  const writes: Array<{ table: string; rows: unknown }> = [];
  const result = (table: string) => ({ error: table === failTable ? { message: `constraint violation on ${table}` } : null });
  const supabase = { from(table: string) {
    return { upsert(rows: unknown) { writes.push({ table, rows }); return Promise.resolve(result(table)); },
      insert(rows: unknown) { writes.push({ table, rows }); return Promise.resolve(result(table)); },
      update() { return { eq: async () => result(table) }; } };
  } };
  const run = () => persistMarketUpdates({ supabase, runDate: "2026-09-14", source: "test", updates: [{ ...update,
    rawPayload: pricingState ? { source: "core", receptionPricingBaseline: { youtube_comments: 12 }, market_events: { pricingHistory: { version: 1 } } } : {} }], summary: {},
    recordRun: false, intraday: true, tickComparisonPrices: { artist: comparisonPrice } } as never);
  return { run, writes };
}
describe("successful quote refresh tracking", () => {
  it("retains intraday pricing state for tomorrow without replacing original daily evidence or fabricating ticks", async () => {
    const { run, writes } = setup(undefined, 50, true);
    expect(await run()).toEqual({ priceTickCount: 0 });
    expect(writes.some(write => write.table === "market_signal_snapshots")).toBe(false);
    const observations = writes.filter(write => write.table === "market_observations");
    expect(observations[0].rows).toEqual([expect.objectContaining({ source: "market_pricing", metric: "evidence_state",
      raw_payload: expect.objectContaining({ receptionPricingBaseline: { youtube_comments: 12 } }) })]);
    expect(observations[1].rows).toEqual([expect.objectContaining({ source: "market_refresh", metric: "completed" })]);
  });
  it("does not mark a refresh complete when its pricing history could not be retained", async () => {
    await expect(setup("market_observations", 50, true).run()).rejects.toThrow("Could not save pricing evidence state");
  });
  it("records unchanged refreshes without fabricating chart ticks or replacing daily signals", async () => {
    const { run, writes } = setup();
    expect(await run()).toEqual({ priceTickCount: 0 });
    expect(writes.map(write => write.table)).toEqual(["artist_stats", "price_history", "market_observations"]);
    expect(writes.at(-1)?.rows).toEqual([expect.objectContaining({ source: "market_refresh", metric: "completed", artist_id: "artist" })]);
  });
  it.each(["artists", "price_history", "price_ticks"])("does not claim completion after a %s write failure", async table => {
    const { run, writes } = setup(table, 49);
    await expect(run()).rejects.toThrow();
    expect(writes.some(write => write.table === "market_observations")).toBe(false);
  });
  it("does not swallow failure to record completion", async () => {
    await expect(setup("market_observations").run()).rejects.toThrow("Could not record quote refresh completion");
  });
});
