import { describe, expect, it } from "vitest";
import { persistMarketUpdates } from "@/server/market/supabase-repository";
const update = { artistId: "artist", ticker: "ART", currentPrice: 50, previousClose: 50, dailyChangePercent: 0, hypeScore: 50,
  modelVersion: "test", stats: {}, rawPayload: {}, explanation: "Unchanged" };
function setup(failTable?: string, comparisonPrice = 50) {
  const writes: Array<{ table: string; rows: unknown }> = [];
  const result = (table: string) => ({ error: table === failTable ? { message: `constraint violation on ${table}` } : null });
  const supabase = { from(table: string) {
    return { upsert(rows: unknown) { writes.push({ table, rows }); return Promise.resolve(result(table)); },
      insert(rows: unknown) { writes.push({ table, rows }); return Promise.resolve(result(table)); },
      update() { return { eq: async () => result(table) }; } };
  } };
  const run = () => persistMarketUpdates({ supabase, runDate: "2026-09-14", source: "test", updates: [update], summary: {},
    recordRun: false, intraday: true, tickComparisonPrices: { artist: comparisonPrice } } as never);
  return { run, writes };
}
describe("successful quote refresh tracking", () => {
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
