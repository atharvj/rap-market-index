import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../app/api/market/observations/[artistId]/route";

const state = vi.hoisted(() => ({ failSecondPage: false, ranges: [] as number[] }));
vi.mock("@/server/observability", () => ({ reportServerError: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseConfigStatus: () => ({ readyForPublicReads: true, serviceRoleConfigured: true }),
  createServiceRoleClient: () => ({ from() {
    const query = {
      select: () => query, eq: () => query, order: () => query, gte: () => query,
      single: async () => ({ data: { id: "example" }, error: null }),
      range: async (from: number, to: number) => {
        state.ranges.push(from);
        if (state.failSecondPage && from > 0) return { data: null, error: { message: "Unavailable" } };
        const count = Math.max(0, Math.min(to + 1, 1501) - from);
        return { data: Array.from({ length: count }, (_, index) => ({
          source: "spotify_public", metric: "monthly_listeners", unit: "listeners",
          observed_date: new Date(Date.UTC(2022, 0, 1 + from + index)).toISOString().slice(0, 10), value: 100000 + from + index
        })), error: null };
      }
    };
    return query;
  } })
}));

beforeEach(() => { state.failSecondPage = false; state.ranges = []; });
const request = () => GET(new Request("http://localhost/api/market/observations/example?range=ALL"), { params: Promise.resolve({ artistId: "example" }) });

describe("public audience history", () => {
  it("includes the newest listener observation beyond the database row cap", async () => {
    const response = await request();
    const result = await response.json();
    expect(response.status).toBe(200);
    expect(state.ranges).toEqual([0, 1000]);
    expect(result.series[0].points).toHaveLength(1501);
    expect(result.series[0].latestValue).toBe(101500);
    expect(result.observationEnd).toBe(new Date(Date.UTC(2022, 0, 1501)).toISOString().slice(0, 10));
  });

  it("does not present a partial history as a successful current snapshot", async () => {
    state.failSecondPage = true;
    const response = await request();
    expect(response.status).toBeGreaterThanOrEqual(500);
    expect((await response.json()).ok).toBe(false);
  });
});
