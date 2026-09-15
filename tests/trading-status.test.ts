import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseTradingStatus } from "@/server/market/trading-status";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), profile: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseConfigStatus: () => ({ readyForPublicReads: true, serviceRoleConfigured: true }),
  createAnonServerClient: () => ({ rpc: mocks.rpc }),
  createServiceRoleClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.profile }) }) }) })
}));
vi.mock("@/server/user-auth", () => ({ requireConfirmedUser: async () => ({ ok: true, user: { id: "user", email: "test@example.test" }, supabase: { rpc: mocks.rpc } }) }));
vi.mock("@/server/rate-limit", () => ({ enforceRateLimit: async () => null }));
vi.mock("@/server/observability", () => ({ reportServerError: vi.fn() }));
vi.mock("@/server/market/release-window", () => ({ loadReleaseWindowStatus: async () => ({ ready: true }) }));
import { GET } from "../app/api/market/status/route";
import { POST } from "../app/api/trades/route";
const valid = { trading_mode: "continuous", market_open: true, market_impact_enabled: true, artist_halted: false, reason: "Open" };
beforeEach(() => { vi.clearAllMocks(); mocks.profile.mockResolvedValue({ data: { is_admin: false, market_impact_exempt: false }, error: null }); });
describe("trading status integrity", () => {
  it.each([null, [], [{}], [valid, valid], [{ ...valid, market_open: "false" }], [{ ...valid, trading_mode: "" }]])("rejects malformed controls %j", data => {
    expect(parseTradingStatus(data)).toBeNull();
  });
  it("accepts explicit closed controls", () => expect(parseTradingStatus([{ ...valid, market_open: false }])?.market_open).toBe(false));
  it("returns unavailable, closed public status on an empty RPC result", async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    const response = await GET(new Request("https://example.test/api/market/status"));
    expect(response.status).toBe(503);
    expect((await response.json()).status.isOpen).toBe(false);
  });
  it("keeps a halted artist closed even if the market is open", async () => {
    mocks.rpc.mockResolvedValue({ data: [{ ...valid, artist_halted: true }], error: null });
    const response = await GET(new Request("https://example.test/api/market/status"));
    expect(response.status).toBe(200);
    expect((await response.json()).status.isOpen).toBe(false);
  });
  it.each(["buy", "sell", "short", "cover"])("never executes %s when controls are unavailable", async side => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    const response = await POST(new Request("https://example.test/api/trades", { method: "POST", body: JSON.stringify({ side, artistId: "artist", shares: 1 }) }));
    expect(response.status).toBe(503);
    expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual(["get_market_trading_status"]);
  });
});
