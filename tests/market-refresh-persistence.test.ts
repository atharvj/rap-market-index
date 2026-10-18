import { describe, expect, it, vi } from "vitest";
import { persistMarketUpdates } from "@/server/market/supabase-repository";
const update = { artistId: "artist", ticker: "ART", currentPrice: 50, previousClose: 50, dailyChangePercent: 0, hypeScore: 50, signalDelta: 0,
  modelVersion: "test", stats: {}, rawPayload: { source: "core", receptionPricingBaseline: { youtube_comments: 12 },
    market_events: { pricingHistory: { version: 1 } } }, explanation: "Unchanged" };
function setup(response: unknown = { data: { atomic: true, artistCount: 1, priceTickCount: 0 }, error: null }) {
  const from = vi.fn(() => { throw new Error("Unexpected non-atomic table write"); });
  const rpc = vi.fn(async () => response);
  const input = { supabase: { from, rpc }, runDate: "2026-10-18", source: "core", recordRun: false,
    intraday: true, tickComparisonPrices: { artist: 50 }, updates: [update], summary: {} };
  const run = (overrides: Record<string, unknown> = {}) => persistMarketUpdates({ ...input, ...overrides } as never);
  return { run, input, from, rpc };
}
describe("atomic quote refresh tracking", () => {
  it("retains intraday evidence through one transaction without fabricating ticks", async () => {
    const { run, from, rpc } = setup();
    expect(await run()).toEqual({ atomic: true, priceTickCount: 0 });
    expect(from).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledExactlyOnceWith("persist_market_quote_batch", expect.objectContaining({
      p_intraday: true, p_comparison_prices: { artist: 50 }, p_ticks: [],
      p_pricing_state: [expect.objectContaining({ source: "market_pricing", metric: "evidence_state",
        raw_payload: expect.objectContaining({ receptionPricingBaseline: { youtube_comments: 12 }, marketEvents: { pricingHistory: { version: 1 } } }) })]
    }));
  });
  it.each([
    { error: { code: "40001", message: "stale quote" }, data: null },
    { error: { code: "42501", message: "permission denied" }, data: null },
    { error: { code: "PGRST202", message: "function missing" }, data: null },
    { error: null, data: { atomic: false } },
    { error: null, data: { atomic: true, artistCount: 2, priceTickCount: 0 } },
    { error: null, data: { atomic: true, artistCount: 1, priceTickCount: 1 } }
  ])("rejects missing, failed or unverifiable transactions without partial writes: %j", async response => {
    const { run, from } = setup(response);
    await expect(run()).rejects.toThrow();
    expect(from).not.toHaveBeenCalled();
  });
  it.each([
    { tickComparisonPrices: undefined }, { tickComparisonPrices: {} },
    { tickComparisonPrices: { artist: Number.NaN } }, { tickComparisonPrices: { artist: 0 } },
    { updates: [{ ...update, rawPayload: { source: "manual" } }] },
    { updates: [{ ...update, rawPayload: { source: "mock" } }] },
    { updates: [{ ...update, rawPayload: {} }] }, { updates: [] }
  ])("rejects incomplete or simulated publication inputs before mutation: %j", async overrides => {
    const { run, from, rpc } = setup();
    await expect(run(overrides)).rejects.toThrow();
    expect(from).not.toHaveBeenCalled(); expect(rpc).not.toHaveBeenCalled();
  });
  it("rejects a missing RPC client without falling back to table writes", async () => {
    const { run, from } = setup();
    await expect(run({ supabase: { from } })).rejects.toThrow("Atomic quote publication requires");
    expect(from).not.toHaveBeenCalled();
  });
  it("preserves intraday mode when also recording the update run", async () => {
    const { run, rpc } = setup();
    const completed = vi.fn(async () => ({ error: null }));
    const from = vi.fn((_table: string) => ({
      upsert: () => ({ select: () => ({ single: async () => ({ data: { id: "run" }, error: null }) }) }),
      update: () => ({ eq: completed })
    }));
    await expect(run({ supabase: { from, rpc }, recordRun: true })).resolves.toEqual({ atomic: true, priceTickCount: 0 });
    expect(rpc).toHaveBeenCalledWith("persist_market_quote_batch", expect.objectContaining({ p_intraday: true }));
    expect(from.mock.calls.every(([table]) => table === "market_update_runs")).toBe(true);
    expect(completed).toHaveBeenCalledExactlyOnceWith("run_date", "2026-10-18");
  });
});
