import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../app/api/market/observations/[artistId]/route";

const state = vi.hoisted(() => ({ failSecondPage: false, ranges: [] as number[], rows: null as null | Array<{source: string; metric: string; unit: string; value: number; observed_date: string}> }));
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
        if (state.rows) return { data: state.rows.slice(from, to + 1), error: null };
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

beforeEach(() => { state.failSecondPage = false; state.ranges = []; state.rows = null; });
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

it("defaults source history to the same three-month window", async () => {
  const result = await (await GET(new Request("http://localhost/api/market/observations/example"), { params: Promise.resolve({ artistId: "example" }) })).json();
  expect(result.range).toBe("3M");
});


it("withholds stale reception estimates after an insufficient same-day collection without erasing history", async () => {
  state.rows = [
    { source: "youtube_comments", metric: "positive_comment_share", unit: "percent", value: 85, observed_date: "2026-10-15" },
    { source: "youtube_comments", metric: "comment_count", unit: "comments", value: 2, observed_date: "2026-10-15" },
    { source: "youtube_comments", metric: "reception_available", unit: "boolean", value: 0, observed_date: "2026-10-15" },
    { source: "bluesky", metric: "reaction_sentiment", unit: "score", value: -30, observed_date: "2026-10-15" },
    { source: "bluesky", metric: "reception_available", unit: "boolean", value: 1, observed_date: "2026-10-15" }
  ];
  const payload = await (await request()).json();
  const old = payload.series.find((s: {key: string}) => s.key === "youtube_comments:positive_comment_share");
  expect(old.latestValue).toBeNull();
  expect(old.points).toEqual([{ date: "2026-10-15", value: 85 }]);
  expect(payload.series.find((s: {key: string}) => s.key === "youtube_comments:comment_count").latestValue).toBe(2);
  expect(payload.series.find((s: {key: string}) => s.key === "bluesky:reaction_sentiment").latestValue).toBe(-30);
});
