import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../app/api/admin/artist-autofill/route";

const state = vi.hoisted(() => ({ writes: [] as Array<{ table: string; operation: string; row: Record<string, unknown> }>, fail: "", observations: vi.fn() }));
vi.mock("@/server/admin-auth", () => ({ requireAdminRequest: async () => ({ ok: true }) }));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseConfigStatus: () => ({ readyForAdminWrites: true }),
  createServiceRoleClient: () => ({ from(table: string) {
    let row: Record<string, unknown> | undefined;
    const result = () => ({ data: row ?? [], error: state.fail === table ? { message: "Storage unavailable" } : null });
    const query = {
      select: () => query, eq: () => query, order: async () => result(), single: async () => result(),
      insert: (value: Record<string, unknown>) => write("insert", value),
      upsert: (value: Record<string, unknown>) => write("upsert", value),
      update: (value: Record<string, unknown>) => write("update", value),
      then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve)
    };
    function write(operation: string, value: Record<string, unknown>) {
      row = value; state.writes.push({ table, operation, row: value }); return query;
    }
    return query;
  } })
}));
vi.mock("@/server/market/supabase-repository", () => ({
  loadArtistExternalIds: async () => ({}),
  upsertArtistExternalIds: async () => ({}),
  persistMarketObservations: (...args: unknown[]) => state.observations(...args)
}));
vi.mock("@/server/market/source-id-resolver", () => ({ resolveArtistSourceIds: async ({ artists }: { artists: Array<{ id: string }> }) => ({
  records: [{ artistId: artists[0].id, spotifyId: "a".repeat(22), youtubeChannelId: "UCexample" }], warnings: [], suggestions: []
}) }));
vi.mock("@/server/market/spotify-public-source", () => ({ collectSpotifyPublicSignals: async ({ artists }: { artists: Array<{ id: string }> }) => ({
  signals: { [artists[0].id]: { stats: {}, rawPayload: { source: "spotify_public", monthlyListeners: 800000 } } }, observations: [{ source: "spotify_public" }], warnings: []
}) }));
vi.mock("@/server/market/youtube-source", () => ({ collectYoutubeMarketSignals: async ({ artists }: { artists: Array<{ id: string }> }) => ({
  signals: { [artists[0].id]: { stats: {}, rawPayload: { source: "youtube", subscriberCount: 30000, viewCount: 4500000 } } }, observations: [{ source: "youtube" }], warnings: []
}) }));
vi.mock("@/server/market/lastfm-source", () => ({ collectLastfmMarketSignals: async () => ({ signals: {}, observations: [], warnings: [] }) }));

beforeEach(() => { state.writes = []; state.fail = ""; state.observations.mockReset().mockResolvedValue(undefined); });
const request = (dryRun = false) => new Request("http://localhost/api/admin/artist-autofill", { method: "POST", body: JSON.stringify({ name: "Example Artist", dryRun }) });

describe("verified listing activation", () => {
  it("saves measurements and one opening point before exposing the listing", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(state.writes[0]).toMatchObject({ table: "artists", row: { is_active: false } });
    expect(state.observations).toHaveBeenCalledOnce();
    expect(state.writes.filter(write => write.table === "price_history")).toHaveLength(1);
    expect(state.writes.filter(write => write.table === "price_ticks")).toHaveLength(1);
    expect(state.writes.at(-1)).toMatchObject({ table: "artists", operation: "update", row: { is_active: true } });
  });

  it.each(["price_history", "price_ticks"])("leaves the listing inactive when %s cannot be saved", async table => {
    state.fail = table;
    expect((await POST(request())).status).toBe(500);
    expect(state.writes.some(write => write.row.is_active === true)).toBe(false);
  });

  it("does not activate a listing when audience observations fail to persist", async () => {
    state.observations.mockRejectedValueOnce(new Error("Storage unavailable"));
    expect((await POST(request())).status).toBe(500);
    expect(state.writes.some(write => write.row.is_active === true)).toBe(false);
  });

  it("keeps previews free of database writes", async () => {
    expect((await POST(request(true))).status).toBe(200);
    expect(state.writes).toHaveLength(0);
    expect(state.observations).not.toHaveBeenCalled();
  });
});
