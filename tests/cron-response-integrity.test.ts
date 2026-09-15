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
vi.mock("@/server/market/release-window", () => ({ loadReleaseWindowStatus: async () => ({ ready: false }) }));
import { GET as catalyst } from "../app/api/cron/catalyst-refresh/route";
import { GET as release } from "../app/api/cron/release-window/route";
const request = () => new Request("https://example.test/api/cron/refresh", { headers: { "x-market-update-secret": "test-secret" } });
beforeEach(() => { vi.stubEnv("MARKET_UPDATE_SECRET", "test-secret"); vi.stubGlobal("fetch", vi.fn()); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
for (const [name, handler] of [["catalyst", catalyst], ["release", release]] as const) {
  describe(`${name} scheduler failure reporting`, () => {
    it.each([{}, null, { ok: false, error: "Scan failed" }, { ok: "true" }])("rejects invalid scan completion %j without repricing", async payload => {
      vi.mocked(fetch).mockResolvedValue(Response.json(payload));
      const response = await handler(request());
      expect(response.status).toBe(502);
      expect((await response.json()).ok).toBe(false);
      expect(fetch).toHaveBeenCalledTimes(1);
    });
    it("reports a failed quote update as an HTTP failure even if upstream used HTTP 200", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(Response.json({ ok: true, artists: [{ id: "ye" }] }))
        .mockResolvedValueOnce(Response.json({ ok: false, error: "Quote write failed" }));
      const response = await handler(request());
      expect(response.status).toBe(502);
      expect((await response.json()).error).toBe("Quote write failed");
      expect(fetch).toHaveBeenCalledTimes(2);
    });
  });
}
