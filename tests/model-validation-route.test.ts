import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ pricingStates: [] as Array<Record<string, unknown>> }));
vi.mock("@/server/admin-auth", () => ({ requireAdminRequest: async () => ({ ok: true }) }));
vi.mock("@/server/market/model-version", () => ({ getMarketModelVersion: () => "rmi-core-v46" }));
vi.mock("@/server/market/supabase-repository", () => ({ loadActiveArtists: async () => [{ id: "a" }] }));
vi.mock("@/lib/supabase/server", () => ({ getSupabaseConfigStatus: () => ({ readyForAdminWrites: true }), createServiceRoleClient: () => ({ from(table: string) {
  let source = "";
  const builder = { select: () => builder, in: () => builder, gte: () => builder, lte: () => builder, order: () => builder, or: () => builder,
    eq: (key: string, value: string) => { if (key === "source") source = value; return builder; },
    range: async () => ({ error: null, data: table === "market_signal_snapshots" ? [{ artist_id: "a", source_date: "2026-10-01", model_version: "rmi-core-v43",
      streaming_growth: 0, youtube_growth: 0, search_growth: 0, social_growth: 0, news_score: 50, trader_demand: 0, pricing_signal: -0.01 }]
      : source === "market_pricing" ? state.pricingStates : [1000,1100,1300].map((value, index) => ({ artist_id: "a", source: "lastfm", metric: "playcount", value,
        observed_date: ["2026-09-24","2026-10-01","2026-10-08"][index] })) }) };
  return builder;
} }) }));
import { GET } from "../app/api/admin/model-validation/route";
beforeEach(() => { state.pricingStates = []; });
describe("validation cohorts and latest executed evidence", () => {
  it("does not credit a new engine with an old engine's historical outcomes", async () => {
    const response = await GET(new Request("https://example.test/api/admin/model-validation?runDate=2026-10-18"));
    const data = await response.json(); expect(response.status).toBe(200);
    expect(data.validation.sampleCount).toBe(0); expect(data.validationByModel["rmi-core-v43"].sampleCount).toBe(1);
  });
  it("evaluates the latest executed return even when the original daily snapshot belongs to an earlier model", async () => {
    state.pricingStates = [{ artist_id: "a", observed_date: "2026-10-01", raw_payload: { version: 1, runDate: "2026-10-01", modelVersion: "rmi-core-v46", executedReturnPercent: 1, pricingSignalPercent: -10 } }];
    const response = await GET(new Request("https://example.test/api/admin/model-validation?runDate=2026-10-18"));
    const data = await response.json(); expect(response.status).toBe(200);
    expect(data.validation.sampleCount).toBe(1); expect(data.validation.directionalAccuracyPercent).toBe(100);
    expect(data.validation.predictionSources.executed_return).toBe(1);
  });
  it("does not score a valuation-model correction as a successful price prediction", async () => {
    state.pricingStates = [{ artist_id: "a", observed_date: "2026-10-01", raw_payload: {
      version: 1, runDate: "2026-10-01", modelVersion: "rmi-core-v46", executedReturnPercent: -30, audienceRevaluation: { factor: 0.7 } } }];
    const data = await (await GET(new Request("https://example.test/api/admin/model-validation?runDate=2026-10-18"))).json();
    expect(data.snapshotRowCount).toBe(0); expect(data.validation.sampleCount).toBe(0);
  });
  it("rejects corrupt pricing-state identity instead of silently assigning it to a cohort", async () => {
    state.pricingStates = [{ artist_id: "a", observed_date: "2026-10-01", raw_payload: { version: 1, runDate: "2026-10-02", modelVersion: "rmi-core-v46", executedReturnPercent: 1 } }];
    const response = await GET(new Request("https://example.test/api/admin/model-validation?runDate=2026-10-18"));
    expect(response.status).toBe(500); expect((await response.json()).ok).toBe(false);
  });
});
