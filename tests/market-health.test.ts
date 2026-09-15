import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ tables: {} as Record<string, unknown[]>, ranges: [] as Array<[string, number]>, status: [] as unknown[] }));
vi.mock("@/server/admin-auth", () => ({ requireAdminRequest: async () => ({ ok: true }) }));
vi.mock("@/server/market/supabase-repository", () => ({ loadActiveArtists: async () => [{ id: "first" }, { id: "last" }], loadArtistExternalIds: async () => ({}) }));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseConfigStatus: () => ({ readyForAdminWrites: true }),
  createServiceRoleClient: () => ({ rpc: async () => ({ data: state.status, error: null }), from(table: string) {
    const result = { data: state.tables[table] ?? [], error: null, count: 0 };
    const builder = {
      select: () => builder, eq: () => builder, in: () => builder, gte: () => builder, lt: () => builder, lte: () => builder, order: () => builder,
      limit: async () => result,
      range: async (from: number, to: number) => { state.ranges.push([table, from]); return { ...result, data: result.data.slice(from, to + 1) }; },
      then(resolve: (value: unknown) => unknown) { return Promise.resolve(result).then(resolve); }
    };
    return builder;
  } })
}));
import { GET } from "../app/api/admin/market-health/route";
beforeEach(() => { state.tables = {}; state.ranges = []; state.status = [{ trading_mode: "continuous", market_open: true, market_impact_enabled: true, artist_halted: false, reason: "Open" }]; });
describe("market health completeness", () => {
  it("reads every page of observations, daily history, ticks and events", async () => {
    const date = "2026-09-14";
    state.tables.market_observations = Array.from({ length: 1001 }, (_, i) => ({ artist_id: i === 1000 ? "last" : "first", source: "youtube_tracks", metric: "views_abcdefghijk", observed_date: date, observed_at: `${date}T12:00:00Z` }));
    state.tables.price_history = Array.from({ length: 1001 }, (_, i) => ({ artist_id: i === 1000 ? "last" : "first", price_date: date }));
    state.tables.price_ticks = Array.from({ length: 1001 }, (_, i) => ({ artist_id: i === 1000 ? "last" : "first", source: "market_run", observed_at: `${date}T12:00:00Z` }));
    state.tables.market_events = Array.from({ length: 1001 }, (_, i) => ({ artist_id: i === 1000 ? "last" : "first", event_type: "release", event_date: date }));
    const response = await GET(new Request(`https://example.test/api/admin/market-health?runDate=${date}`));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.observationHealth.find((row: { source: string }) => row.source === "youtube_tracks").freshArtistCount).toBe(2);
    expect(body.priceHistoryHealth.freshArtistCount).toBe(2);
    expect(body.priceTickHealth.tickCount).toBe(1001);
    expect(body.eventHealth.eventCount).toBe(1001);
    for (const table of ["market_observations", "price_history", "price_ticks", "market_events"]) expect(state.ranges).toContainEqual([table, 1000]);
  });
  it("detects a stale refresh even when today's daily close exists", async () => {
    const now = Date.now(), date = new Date(now).toISOString().slice(0, 10);
    state.tables.market_observations = [
      { artist_id: "first", source: "market_refresh", metric: "completed", observed_date: date, observed_at: new Date(now - 10000).toISOString() },
      { artist_id: "last", source: "market_refresh", metric: "completed", observed_date: date, observed_at: new Date(now - 7200000).toISOString() }
    ];
    state.tables.price_history = [{ artist_id: "last", price_date: date }];
    state.status = [];
    const body = await (await GET(new Request(`https://example.test/api/admin/market-health?runDate=${date}`))).json();
    const refresh = body.observationHealth.find((row: { source: string }) => row.source === "market_refresh");
    expect(refresh.freshArtistCount).toBe(1);
    expect(refresh.staleArtistCount).toBe(1);
    expect(body.warnings).toContain("Quote refreshes (last hour) fresh coverage is 50.0%.");
    expect(body.marketOperations.ready).toBe(false);
    expect(body.marketOperations.marketOpen).toBe(false);
  });
});
