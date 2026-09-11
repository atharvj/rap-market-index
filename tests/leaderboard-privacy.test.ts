import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../app/api/leaderboard/route";

const state = vi.hoisted(() => ({ requester: null as string | null, failAdminLookup: false, filters: [] as string[] }));
vi.mock("@/server/observability", () => ({ reportServerError: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseConfigStatus: () => ({ readyForPublicReads: true, serviceRoleConfigured: true }),
  createAnonServerClient: () => ({ auth: { getUser: async () => ({ data: { user: state.requester ? { id: state.requester, email_confirmed_at: "2026-01-01" } : null }, error: null }) } }),
  createServiceRoleClient: () => ({ from(table: string) {
    const profiles = [
      { id: "admin", is_admin: true, profile_is_public: true },
      { id: "first", is_admin: false, profile_is_public: true },
      { id: "second", is_admin: false, profile_is_public: true },
      { id: "private", is_admin: false, profile_is_public: false }
    ].map(row => ({ ...row, avatar_url: null, portfolio_is_public: false }));
    let rows: Array<Record<string, any>> = table === "profiles" ? profiles : profiles.map((row, index) => ({ user_id: row.id, username: row.id, portfolio_value: [100000, 50000, 30000, 20000][index], cash_balance: 12345 }));
    let countOnly = false;
    let adminLookup = false;
    const result = () => ({ data: rows, count: countOnly ? rows.length : null, error: adminLookup && state.failAdminLookup ? { message: "Unavailable" } : null });
    const query = {
      select: (_columns: string, options?: { head?: boolean }) => { countOnly = options?.head ?? false; return query; },
      eq: (key: string, value: unknown) => { if (key === "is_admin") adminLookup = true; rows = rows.filter(row => row[key] === value); return query; },
      in: (key: string, values: unknown[]) => { rows = rows.filter(row => values.includes(row[key])); return query; },
      not: (key: string, _operator: string, value: string) => { state.filters.push(`${table}:exclude`); rows = rows.filter(row => !value.slice(1, -1).split(",").includes(row[key])); return query; },
      gt: (key: string, value: number) => { rows = rows.filter(row => row[key] > value); return query; },
      order: () => query,
      limit: (count: number) => { state.filters.push(`${table}:limit`); rows = rows.slice(0, count); return query; },
      range: async (from: number, to: number) => ({ ...result(), data: rows.slice(from, to + 1) }),
      maybeSingle: async () => ({ ...result(), data: rows[0] ?? null }),
      then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve)
    };
    return query;
  } })
}));

beforeEach(() => { state.requester = null; state.failAdminLookup = false; state.filters = []; });
const request = () => GET(new Request("http://localhost/api/leaderboard", { headers: state.requester ? { authorization: "Bearer example" } : {} }));

describe("ranking eligibility and private roles", () => {
  it("excludes admins before limiting results and never exposes their role or private profiles", async () => {
    const response = await request();
    const result = await response.json();
    expect(result.leaderboard.map((row: { id: string }) => row.id)).toEqual(["first", "second"]);
    expect(result.leaderboard.every((row: { isAdmin: boolean; cashBalance: number }) => row.isAdmin === false && row.cashBalance === 0)).toBe(true);
    expect(state.filters.slice(0, 2)).toEqual(["market_leaderboard:exclude", "market_leaderboard:limit"]);
    expect(JSON.stringify(result)).not.toContain("is_admin");
  });

  it("does not append an administrator's own rank when they sign in", async () => {
    state.requester = "admin";
    const response = await request();
    expect(response.headers.get("cache-control")).toContain("private");
    expect((await response.json()).leaderboard.some((row: { id: string }) => row.id === "admin")).toBe(false);
  });

  it("excludes administrator portfolios from a private user's rank count", async () => {
    state.requester = "private";
    const result = await (await request()).json();
    expect(result.leaderboard.find((row: { id: string }) => row.id === "private").rank).toBe(3);
  });

  it("fails closed when eligibility cannot be verified", async () => {
    state.failAdminLookup = true;
    const response = await request();
    expect(response.status).toBe(500);
    expect((await response.json()).ok).toBe(false);
  });
});
