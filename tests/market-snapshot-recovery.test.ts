import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ after: vi.fn(), recover: vi.fn(), error: null as unknown, ready: true, revisions: [] as number[] }));
vi.mock("next/server", async original => ({ ...await original<typeof import("next/server")>(), after: mocks.after }));
vi.mock("@/server/market/market-catchup", () => ({ recoverStaleMarket: mocks.recover }));
vi.mock("@/server/observability", () => ({ reportServerError: vi.fn() }));
vi.mock("@/server/market/artist-images", () => ({ loadArtistImageUrls: async () => new Map() }));
vi.mock("@/server/market/chart-adjustments", () => ({ loadChartAdjustments: async () => ({}) }));
vi.mock("@/lib/supabase/server", () => ({ getSupabaseConfigStatus: () => ({ readyForPublicReads: mocks.ready, serviceRoleConfigured: true }), createServiceRoleClient: () => ({ from(table: string) {
  const revision = table === "artists" ? (mocks.revisions.shift() ?? 1) : 1;
  const rows = table === "artists" ? [{ updated_at: String(revision), id: "a", name: "Artist", ticker: "ART", current_price: 49 + revision, previous_close: 49, daily_change_percent: 2, hype_score: 50, volatility: 1, category: "mainstream" }] : [];
  const builder = { select: () => builder, eq: () => builder, in: () => builder, gte: () => builder, order: () => builder,
    range: async () => ({ data: rows, error: mocks.error }), then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows, error: mocks.error }).then(resolve) };
  return builder;
} }) }));
import { GET } from "../app/api/market/snapshot/route";
beforeEach(() => { mocks.after.mockReset(); mocks.recover.mockReset().mockResolvedValue(undefined); mocks.error = null; mocks.ready = true; mocks.revisions = []; vi.stubEnv("VERCEL_ENV", "production"); });
afterEach(() => vi.unstubAllEnvs());
describe("public snapshot background recovery", () => {
  it("returns the verified market response before executing recovery", async () => {
    const response = await GET(); expect(response.status).toBe(200);
    expect((await response.json()).state.artists[0].currentPrice).toBe(50);
    expect(mocks.after).toHaveBeenCalledTimes(1); expect(mocks.recover).not.toHaveBeenCalled();
    await mocks.after.mock.calls[0][0](); expect(mocks.recover).toHaveBeenCalledWith({ supabase: expect.anything(), artistIds: ["a"] });
  });
  it("does not let a recovery failure replace the verified snapshot", async () => {
    mocks.recover.mockRejectedValue(new Error("collector unavailable"));
    const response = await GET(); expect(response.status).toBe(200);
    await expect(mocks.after.mock.calls[0][0]()).resolves.toBeUndefined();
  });
  it("does not initiate live work in preview or local environments", async () => {
    vi.stubEnv("VERCEL_ENV", "preview"); expect((await GET()).status).toBe(200); expect(mocks.after).not.toHaveBeenCalled();
  });
  it("does not start recovery from mock or failed snapshots", async () => {
    mocks.ready = false; expect((await GET()).status).toBe(503); expect(mocks.after).not.toHaveBeenCalled();
    mocks.ready = true; mocks.error = { message: "database unavailable" }; expect((await GET()).status).toBe(500); expect(mocks.after).not.toHaveBeenCalled();
  });
});

it("retries a quote publication that raced the history read before returning a snapshot",async()=>{
  mocks.revisions=[1,2,2,2];
  const response=await GET();expect(response.status).toBe(200);
  expect((await response.json()).state.artists[0].currentPrice).toBe(51);expect(mocks.after).toHaveBeenCalledTimes(1);
});
it("does not cache or publish a mixed snapshot if quotes keep changing",async()=>{
  mocks.revisions=[1,2,3,4];
  const response=await GET();expect(response.status).toBe(500);expect(response.headers.get("cache-control")).toBe("no-store");
  expect(mocks.after).not.toHaveBeenCalled();
});
