import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ snapshots: {} as Record<string, Record<string, unknown>>, times: {} as Record<string, string>,
  collect: vi.fn(), persist: vi.fn() }));
vi.mock("@/server/market/market-date", () => ({ getMarketDate: () => "2026-10-15", shiftMarketDate: () => "2026-10-16" }));
vi.mock("@/server/market/supabase-repository", () => ({
  loadActiveArtists: async () => [{ id: "a", name: "Artist" }], loadLatestObservationPayloads: async () => mocks.snapshots,
  loadLatestSourceObservationTimes: async () => mocks.times, persistMarketObservations: (...args: unknown[]) => mocks.persist(...args)
}));
vi.mock("@/server/market/apple-charts-source", () => ({ collectAppleChartSignals: (...args: unknown[]) => mocks.collect(...args) }));
import { isAppleChartRecoveryDue, recoverAppleChartObservations } from "@/server/market/apple-chart-recovery";
const scores = { us: 10, gb: 0, ca: 3, "us:albums": 2, "gb:albums": 0, "ca:albums": 0 };
beforeEach(() => { mocks.snapshots = {}; mocks.times = {}; mocks.collect.mockReset(); mocks.persist.mockReset(); });
describe("bounded chart observation recovery", () => {
  it("skips complete same-date snapshots and throttles incomplete attempts", () => {
    const now = Date.parse("2026-10-15T12:00:00Z");
    expect(isAppleChartRecoveryDue({ runDate: "2026-10-15", scores }, undefined, "2026-10-15", now)).toBe(false);
    expect(isAppleChartRecoveryDue({ runDate: "2026-10-14", scores }, undefined, "2026-10-15", now)).toBe(true);
    expect(isAppleChartRecoveryDue({}, "2026-10-15T11:30:00Z", "2026-10-15", now)).toBe(false);
    expect(isAppleChartRecoveryDue({}, "2026-10-15T10:30:00Z", "2026-10-15", now)).toBe(true);
  });
  it("persists recovered evidence without calling any quote persistence function", async () => {
    mocks.collect.mockResolvedValue({ signals: { a: { rawPayload: { scores } } }, observations: [{ artistId: "a", metric: "album_chart_points", value: 2 }], warnings: [] });
    const result = await recoverAppleChartObservations({} as never);
    expect(result.completedArtists).toBe(1);
    expect(mocks.persist).toHaveBeenCalledWith({}, expect.arrayContaining([expect.objectContaining({ metric: "album_chart_points" }), expect.objectContaining({ metric: "collection_attempt" })]));
  });
  it("records an attempt when every provider feed fails, preventing retry bursts without zero ranks", async () => {
    mocks.collect.mockResolvedValue({ signals: {}, observations: [], warnings: ["Unavailable"] });
    const result = await recoverAppleChartObservations({} as never);
    expect(result.completedArtists).toBe(0);
    expect(mocks.persist.mock.calls[0][1]).toEqual([expect.objectContaining({ metric: "collection_attempt" })]);
  });
  it("does not collect or write when all current snapshots are complete", async () => {
    mocks.snapshots = { a: { runDate: "2026-10-15", scores } };
    expect((await recoverAppleChartObservations({} as never)).skipped).toBe(true);
    expect(mocks.collect).not.toHaveBeenCalled(); expect(mocks.persist).not.toHaveBeenCalled();
  });
});
