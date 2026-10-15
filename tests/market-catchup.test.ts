import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ claim: vi.fn(), ready: vi.fn(), report: vi.fn() }));
vi.mock("@/server/market/automation-lease", () => ({ claimAutomationWindow: mocks.claim }));
vi.mock("@/server/market/release-window", () => ({ loadReleaseWindowStatus: mocks.ready }));
vi.mock("@/server/observability", () => ({ reportServerError: mocks.report }));
import { hasStaleMarketCoverage, recoverStaleMarket } from "@/server/market/market-catchup";
const now = Date.parse("2026-10-15T15:00:00Z");
const fresh = { artist_id: "a", observed_at: "2026-10-15T14:45:00Z" };
function database(rows: unknown[], error: unknown = null) {
  const filters: unknown[] = [];
  const builder = { select: () => builder, eq: (key: string, value: string) => { filters.push([key, value]); return builder; },
    in: () => builder, order: () => builder, range: async () => ({ data: rows, error }) };
  return { client: { from: () => builder } as never, filters };
}
beforeEach(() => { mocks.claim.mockReset().mockResolvedValue(true); mocks.ready.mockReset().mockResolvedValue({ ready: true }); mocks.report.mockReset(); vi.stubEnv("MARKET_UPDATE_SECRET", "test-secret"); });
afterEach(() => vi.unstubAllEnvs());
describe("background recovery after market reads", () => {
  it("requires fresh completion for every current artist, not just one recent quote", () => {
    expect(hasStaleMarketCoverage(["a"], [fresh], now)).toBe(false);
    expect(hasStaleMarketCoverage(["a", "b"], [fresh], now)).toBe(true);
    for (const date of ["2026-10-15T14:30:00Z", "bad", "2026-10-15T16:00:00Z"]) expect(hasStaleMarketCoverage(["a"], [{ ...fresh, observed_at: date }], now)).toBe(true);
    expect(hasStaleMarketCoverage([], [], now)).toBe(false);
  });
  it("leaves fresh markets alone and scopes evidence to today's completed refreshes", async () => {
    const db = database([fresh]), fetchImpl = vi.fn();
    expect(await recoverStaleMarket({ supabase: db.client, artistIds: ["a"], now, fetchImpl })).toMatchObject({ attempted: false, reason: "fresh" });
    expect(db.filters).toEqual([["source", "market_refresh"], ["metric", "completed"], ["observed_date", "2026-10-15"]]);
    expect(mocks.claim).not.toHaveBeenCalled(); expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("uses a distributed cooldown before any external collection", async () => {
    mocks.claim.mockResolvedValue(false); const fetchImpl = vi.fn();
    expect(await recoverStaleMarket({ supabase: database([]).client, artistIds: ["a"], now, fetchImpl })).toMatchObject({ attempted: false, reason: "throttled" });
    expect(mocks.claim).toHaveBeenCalledWith(expect.anything(), "market-visitor-recovery", 900); expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("recovers a missed daily opening without racing another Apple collection", async () => {
    mocks.ready.mockResolvedValue({ ready: false }); const fetchImpl = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    expect(await recoverStaleMarket({ supabase: database([]).client, artistIds: ["a"], now, fetchImpl })).toMatchObject({ attempted: true, kind: "opening", completed: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]).toEqual(["https://rap-market-index.vercel.app/api/cron/release-window", expect.objectContaining({ headers: { "x-market-update-secret": "test-secret" }, redirect: "error", cache: "no-store" })]);
  });
  it("refreshes stale intraday data and recovers chart observations independently", async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => Response.json({ ok: true }));
    expect(await recoverStaleMarket({ supabase: database([]).client, artistIds: ["a"], now, fetchImpl })).toMatchObject({ kind: "intraday", completed: true });
    expect(fetchImpl.mock.calls.map(call => call[0])).toEqual(["https://rap-market-index.vercel.app/api/cron/catalyst-refresh", "https://rap-market-index.vercel.app/api/cron/chart-recovery"]);
  });
  it("reports failed automation without treating HTTP 200 or a busy skip as completed", async () => {
    mocks.ready.mockResolvedValue({ ready: false });
    for (const payload of [{ ok: false }, {}, { ok: true, skipped: true, busy: true }]) {
      const result = await recoverStaleMarket({ supabase: database([]).client, artistIds: ["a"], now, fetchImpl: vi.fn().mockResolvedValue(Response.json(payload)) });
      expect(result.completed).toBe(false);
    }
    expect(mocks.report).toHaveBeenCalledTimes(2);
  });
  it("does not start unbounded work if freshness or distributed locking fails", async () => {
    const fetchImpl = vi.fn();
    await expect(recoverStaleMarket({ supabase: database([], { message: "down" }).client, artistIds: ["a"], now, fetchImpl })).rejects.toThrow("verify market freshness");
    mocks.claim.mockRejectedValue(new Error("lock unavailable"));
    await expect(recoverStaleMarket({ supabase: database([]).client, artistIds: ["a"], now, fetchImpl })).rejects.toThrow("lock unavailable");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
