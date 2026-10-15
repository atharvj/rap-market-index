import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ authorized: false, recover: vi.fn() }));
vi.mock("@/server/admin-auth", () => ({ requireAdminRequest: async () => state.authorized ? { ok: true } : { ok: false, response: new Response("Unauthorized", { status: 401 }) } }));
vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient: () => ({}) }));
vi.mock("@/server/observability", () => ({ reportServerError: vi.fn() }));
vi.mock("@/server/market/apple-chart-recovery", () => ({ recoverAppleChartObservations: (...args: unknown[]) => state.recover(...args) }));
import { GET } from "../app/api/cron/chart-recovery/route";
beforeEach(() => { state.authorized = false; state.recover.mockReset(); });
it("does not collect or persist charts without authorization", async () => {
  expect((await GET(new Request("https://example.test/api/cron/chart-recovery"))).status).toBe(401);
  expect(state.recover).not.toHaveBeenCalled();
});
it("reports the bounded recovery result", async () => {
  state.authorized = true; state.recover.mockResolvedValue({ skipped: true, attemptedArtists: 0, completedArtists: 0, warnings: [] });
  expect((await (await GET(new Request("https://example.test/api/cron/chart-recovery"))).json()).ok).toBe(true);
});
it("fails explicitly on persistence errors", async () => {
  state.authorized = true; state.recover.mockRejectedValue(new Error("Database unavailable"));
  const response = await GET(new Request("https://example.test/api/cron/chart-recovery"));
  expect(response.status).toBe(500);expect((await response.json()).ok).toBe(false);
});
