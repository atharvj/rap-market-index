import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseConfigStatus: () => ({ readyForAdminWrites: true }),
  createServiceRoleClient: () => ({ from() {
    const builder = { select: () => builder, gte: () => builder, or: () => builder, order: () => builder, limit: async () => ({ data: [], error: null }) };
    return builder;
  } })
}));
vi.mock("@/server/rate-limit", () => ({ enforceRateLimit: async () => null, getRequestIp: () => "127.0.0.1" }));
vi.mock("@/server/product-analytics", () => ({ pruneProductAnalyticsEvents: async () => undefined }));
const lease = vi.hoisted(() => vi.fn());
vi.mock("@/server/market/automation-lease", () => ({ claimAutomationWindow: lease }));
const ready = vi.hoisted(() => vi.fn());
vi.mock("@/server/market/release-window", () => ({ loadReleaseWindowStatus: ready }));
import { GET as catalyst } from "../app/api/cron/catalyst-refresh/route";
import { GET as release } from "../app/api/cron/release-window/route";
const request = () => new Request("https://example.test/api/cron/refresh", { headers: { "x-market-update-secret": "test-secret" } });
const successfulQuotes = () => ({ ok: true, persisted: true, summary: { artistCount: 89 }, updates: Array(89).fill({ artistId: "artist" }) });
beforeEach(() => { lease.mockReset().mockResolvedValue(true); ready.mockReset().mockResolvedValue({ ready: false }); vi.stubEnv("MARKET_UPDATE_SECRET", "test-secret"); vi.stubGlobal("fetch", vi.fn()); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
for (const [name, handler] of [["catalyst", catalyst], ["release", release]] as const) {
  describe(`${name} scheduler failure reporting`, () => {
    it.each([{}, null, { ok: false, error: "Scan failed" }, { ok: "true" }])("rejects invalid worker completion %j", async payload => {
      vi.mocked(fetch).mockResolvedValue(Response.json(payload));
      const response = await handler(request());
      expect(response.status).toBe(502);
      expect((await response.json()).ok).toBe(false);
      expect(fetch).toHaveBeenCalledTimes(1);
    });
    it("skips concurrent automation before scanning or repricing", async () => {
      lease.mockResolvedValue(false);
      const response = await handler(request());
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ ok: true, skipped: true, busy: true });
      expect(fetch).not.toHaveBeenCalled();
    });
    it("fails closed when shared automation locking is unavailable", async () => {
      lease.mockRejectedValue(new Error("database unavailable"));
      const response = await handler(request());
      expect(response.status).toBe(503);
      expect((await response.json()).ok).toBe(false);
      expect(fetch).not.toHaveBeenCalled();
    });
    it("reports a failed quote update as an HTTP failure even if upstream used HTTP 200", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(Response.json({ ok: false, error: "Quote write failed" }));
      const response = await handler(request());
      expect(response.status).toBe(502);
      expect((await response.json()).error).toBe("Quote write failed");
      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });
}

it("refreshes measured quotes before news discovery and still reports a later discovery failure", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(Response.json(successfulQuotes()))
    .mockResolvedValueOnce(Response.json({ ok: false, error: "Publisher unavailable" }));
  const response = await catalyst(request());
  expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain("/api/admin/daily-market-update");
  expect(String(vi.mocked(fetch).mock.calls[1][0])).toContain("/api/admin/market-event-scan");
  expect(response.status).toBe(502);
  expect(await response.json()).toMatchObject({ ok: false, stage: "event-scan", pricesRefreshed: true, recalculatedArtistCount: 89 });
});

it("does not recollect the whole roster after a scan with no new pending catalyst", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(Response.json(successfulQuotes()))
    .mockResolvedValueOnce(Response.json({ ok: true, artists: [{ id: "ye" }] }));
  const response = await catalyst(request());
  expect(await response.json()).toMatchObject({ ok: true, recalculated: true, recalculatedArtistCount: 89 });
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("does not report an unverified or dry-run worker response as refreshed live prices", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(Response.json({ ...successfulQuotes(), persisted: false }));
  const response = await catalyst(request());
  expect(response.status).toBe(502);
  expect(await response.json()).toMatchObject({ ok: false, stage: "repricing" });
  expect(fetch).toHaveBeenCalledTimes(1);
});


it("opens daily quotes without waiting for publisher discovery and verifies completion", async () => {
  ready.mockResolvedValueOnce({ ready: false }).mockResolvedValueOnce({ ready: true });
  vi.mocked(fetch).mockImplementation(async input => {
    if (!String(input).endsWith("/api/cron/daily-market-update")) throw new Error("Publisher discovery must not block the opening");
    return Response.json({ ok: true, result: { persisted: true, processedArtistCount: 89 } });
  });
  const response = await release(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ ok: true, eventScan: { disabled: true } });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(ready).toHaveBeenCalledTimes(2);
});

it("keeps an unverified daily opening closed even after a successful worker response", async () => {
  vi.mocked(fetch).mockResolvedValue(Response.json({ ok: true }));
  const response = await release(request());
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ ok: false, stage: "verification" });
});
