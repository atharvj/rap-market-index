import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../app/api/market/history/[artistId]/route";
import { originalPriceHistory } from "@/lib/adjusted-price-history";

const state = vi.hoisted(() => ({ failPage: false, intraday: false, ranges: [] as number[] }));
vi.mock("@/server/observability", () => ({ reportServerError: vi.fn() }));
vi.mock("@/server/market/chart-adjustments", () => ({ loadChartAdjustments: async () => ({
  example: [{ effectiveDate: "2026-09-10", effectiveAt: "2026-09-11T03:00:00Z", factor: 3 }]
}) }));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseConfigStatus: () => ({ readyForPublicReads: true, serviceRoleConfigured: true }),
  createServiceRoleClient: () => ({ from() {
    const query = {
      select: () => query, eq: () => query, neq: () => query, order: () => query, gte: () => query,
      single: async () => ({ data: { id: "example", current_price: 30 }, error: null }),
      range: async (from: number, to: number) => {
        state.ranges.push(from);
        if (state.failPage && from > 0) return { data: null, error: { message: "price_ticks request timed out" } };
        const count = Math.max(0, Math.min(to + 1, 1501) - from);
        return { data: Array.from({ length: count }, (_, index) => state.intraday ? {
          observed_at: new Date(Date.parse("2026-09-11T02:50:00Z") + (from + index) * 1000).toISOString(),
          price: from + index < 600 ? 10 + (from + index) / 100 : (10 + (from + index) / 100) * 3,
          source: "market_run", raw_payload: { runDate: "2026-09-10", intraday: true }
        } : {
          price_date: new Date(Date.UTC(2022, 0, 1 + from + index)).toISOString().slice(0, 10), price: 10 + (from + index) / 100
        }), error: null };
      }
    };
    return query;
  } })
}));

beforeEach(() => { state.failPage = false; state.intraday = false; state.ranges = []; });
const request = (range = "ALL") => GET(new Request(`http://localhost/api/market/history/example?range=${range}`), { params: Promise.resolve({ artistId: "example" }) });

describe("public price history", () => {
  it("retains every daily close past the database cap and exposes original prices", async () => {
    const response = await request();
    const result = await response.json();
    expect(response.status).toBe(200);
    expect(state.ranges).toEqual([0, 1000]);
    expect(result.points).toHaveLength(1501);
    expect(result.recordedCloseCount).toBe(1501);
    expect(result.priceBasis).toBe("adjusted");
    expect(originalPriceHistory(result.points)[1500].price).toBe(25);
    expect(result.points[1500].price).toBe(75);
  });

  it("retains earlier same-day updates and applies the factor only before the exact tick", async () => {
    state.intraday = true;
    const result = await (await request("1D")).json();
    expect(state.ranges).toEqual([0, 1000]);
    expect(result.points).toHaveLength(1502);
    expect(result.points[599].recordedPrice).toBe(15.99);
    expect(result.points[600]).toEqual({ date: "2026-09-11T03:00:00.000Z", price: 48 });
    expect(result.points[1500].price).toBe(75);
  });

  it("does not pass off a failed later page as complete history", async () => {
    state.failPage = true;
    state.intraday = true;
    const response = await request("1D");
    expect(response.status).toBe(500);
    expect((await response.json()).ok).toBe(false);
  });
});
