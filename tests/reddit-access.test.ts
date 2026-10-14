import { describe, expect, it } from "vitest";
import { isRedditAccessEnabled } from "@/server/market/reddit-access";
import { restoreDailySources } from "@/server/market/daily-source-cache";

describe("approved Reddit access", () => {
  it("requires approval and explicit enablement, not credentials alone", () => {
    expect(isRedditAccessEnabled({ REDDIT_CLIENT_ID: "id", REDDIT_CLIENT_SECRET: "secret" })).toBe(false);
    expect(isRedditAccessEnabled({ MARKET_REDDIT_ENABLED: "true" })).toBe(false);
    expect(isRedditAccessEnabled({ MARKET_REDDIT_API_APPROVED: "true" })).toBe(false);
    expect(isRedditAccessEnabled({ MARKET_REDDIT_API_APPROVED: "true", MARKET_REDDIT_ENABLED: "true" })).toBe(true);
  });
  it("does not replay disabled Reddit evidence from a daily cache", () => {
    const row = { artist_id: "artist", source_date: "2026-10-14", raw_payload: { dailySourceInputs: {
      reddit: { stats: { socialGrowth: 40 }, rawPayload: { source: "reddit" } }
    } } };
    expect(restoreDailySources([row], row.source_date)).toEqual([]);
  });
});
