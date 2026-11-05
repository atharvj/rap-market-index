import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/lib/supabase/server", () => ({ getSupabaseConfigStatus: () => ({ readyForPublicReads: false, serviceRoleConfigured: false }) }));
vi.mock("@/server/observability", () => ({ reportServerError: vi.fn() }));
import { GET as snapshot } from "../app/api/market/snapshot/route";
import { GET as history } from "../app/api/market/history/[artistId]/route";
import { GET as observations } from "../app/api/market/observations/[artistId]/route";
import { GET as status } from "../app/api/market/status/route";
import { GET as news } from "../app/api/market/news/route";
import { GET as leaderboard } from "../app/api/leaderboard/route";
afterEach(() => vi.unstubAllEnvs());
it("never replaces a misconfigured production market with successful demo data", async () => {
  vi.stubEnv("VERCEL_ENV","production");
  const req=new Request("https://example.test/market");const params={params:Promise.resolve({artistId:"ye"})};
  for(const response of await Promise.all([snapshot(),history(req,params),observations(req,params),status(req),news(req),leaderboard(req)])) {
    expect(response.status).toBe(503); expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ok:false,source:"supabase"});
  }
});
