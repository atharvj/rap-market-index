import { describe, expect, it, vi } from "vitest";
const createClient = vi.hoisted(() => vi.fn(() => { throw new Error("Unexpected database access"); }));
vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient: createClient,
  getSupabaseConfigStatus: () => ({ readyForAdminWrites: true }) }));
vi.mock("@/server/admin-auth", () => ({ requireAdminRequest: async () => ({ ok: true, source: "market-secret" }) }));
vi.mock("@/server/market/market-date", async importOriginal => ({ ...await importOriginal<typeof import("@/server/market/market-date")>(), getMarketDate: () => "2026-10-18" }));
import { POST } from "../app/api/admin/daily-market-update/route";
describe("live pricing session boundaries", () => {
  it.each(["2026-10-17", "2026-10-19", "2026-02-30", "invalid"])("rejects live sources assigned to %s before touching data", async runDate => {
    const response = await POST(new Request("https://example.test/api/admin/daily-market-update", { method: "POST", body: JSON.stringify({ dryRun: false, source: "core", runDate }) }));
    expect(response.status).toBe(400); expect(createClient).not.toHaveBeenCalled();
  });
  it.each(["mock", "manual"])("does not publish %s price signals", async source => {
    const response = await POST(new Request("https://example.test/api/admin/daily-market-update", { method: "POST", body: JSON.stringify({ dryRun: false, source }) }));
    expect(response.status).toBe(400); expect(createClient).not.toHaveBeenCalled();
  });
  it.each(["null", "[]", "bad JSON"])("rejects malformed request %s", async body => {
    const response = await POST(new Request("https://example.test/api/admin/daily-market-update", { method: "POST", body }));
    expect(response.status).toBe(400); expect(createClient).not.toHaveBeenCalled();
  });
});
