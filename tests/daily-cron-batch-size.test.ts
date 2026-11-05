import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/server/rate-limit", () => ({ enforceRateLimit: async () => null, getRequestIp: () => "test" }));
vi.mock("@/server/product-analytics", () => ({ pruneProductAnalyticsEvents: async () => {} }));
vi.mock("@/server/account-recreation", () => ({ deleteExpiredAccountRecreationCooldowns: async () => 0 }));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseConfigStatus: () => ({ readyForAdminWrites: true }),
  createServiceRoleClient: () => ({ from(table: string) {
    const result = () => ({ error: null, data: table === "artists" ? Array.from({ length: 89 }, (_, i) => ({ id: String(i) }))
      : table === "price_history" ? Array.from({ length: 25 }, (_, i) => ({ artist_id: String(i) })) : null });
    const chain = { select: () => chain, eq: () => chain, in: () => chain,
      maybeSingle: async () => ({ error: null, data: null }),
      then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve) };
    return chain;
  } })
}));
import { GET } from "../app/api/cron/daily-market-update/route";
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it("finishes the current roster in one worker even with legacy 25-artist settings", async () => {
  vi.stubEnv("MARKET_UPDATE_SECRET", "test-secret"); vi.stubEnv("MARKET_CRON_ARTIST_LIMIT", "25");
  vi.stubEnv("MARKET_CRON_MAX_BATCHES", "4");
  const fetcher = vi.fn().mockResolvedValue(Response.json({ ok: true, persisted: true, processedArtistCount: 89, hasMore: false }));
  vi.stubGlobal("fetch", fetcher);
  const response = await GET(new Request("https://example.test/api/cron/daily-market-update", { headers: { "x-market-update-secret": "test-secret" } }));
  expect(response.status).toBe(200);
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({ artistLimit: 89, maxBatches: 4, artistOffset: 0 });
});
