import { describe, expect, it } from "vitest";
import { collectAiResearchMarketEvents } from "@/server/market/ai-research-source";
import type { MarketUpdateArtist } from "@/server/market/daily-update";

const artist: MarketUpdateArtist = {
  id: "ken-carson",
  name: "Ken Carson",
  ticker: "KEN",
  currentPrice: 40,
  previousClose: 40,
  hypeScore: 55,
  volatility: 1,
  category: "mainstream",
  stats: {
    streamingGrowth: 0,
    youtubeGrowth: 0,
    searchGrowth: 0,
    socialGrowth: 0,
    newsScore: 50,
    traderDemand: 0
  }
};

function groqResponse(event: Record<string, unknown>, publishedDate?: string) {
  const url = "https://www.billboard.com/music/rb-hip-hop/ken-carson-new-album-123";

  return new Response(JSON.stringify({
    choices: [{
      message: {
        content: JSON.stringify({ events: [event] }),
        executed_tools: [{
          type: "web_search",
          search_results: [{
            title: "Ken Carson announces new album",
            url,
            published_date: publishedDate
          }]
        }]
      }
    }]
  }), { status: 200 });
}

function event(overrides: Record<string, unknown> = {}) {
  return {
    title: "Ken Carson announces a new album",
    eventDate: "2026-07-10",
    eventType: "release",
    sourceName: "Billboard",
    sourceUrl: "https://www.billboard.com/music/rb-hip-hop/ken-carson-new-album-123",
    summary: "Ken Carson announced a new album.",
    sentimentScore: 0.5,
    fanSentimentScore: 0.6,
    criticSentimentScore: 0.4,
    impactScore: 0.8,
    confidence: 0.9,
    artistRole: "primary",
    sourceType: "music_publication",
    evidenceLevel: "confirmed",
    reachScope: "broad",
    marketConnection: "direct_music",
    musicDemandConfirmed: true,
    factualClaimConfirmed: true,
    riskFlags: [],
    ...overrides
  };
}

describe("AI research source normalization", () => {
  it("converts fractional signed scores to the documented -100 to 100 scale", async () => {
    const result = await collectAiResearchMarketEvents({
      artists: [artist],
      runDate: "2026-07-11",
      apiKey: "test-key",
      delayMs: 0,
      fetchImpl: async () => groqResponse(event())
    });
    const accepted = result.eventsByArtist[artist.id]?.[0];

    expect(accepted).toBeDefined();
    expect(accepted?.impactScore).toBe(80);
    expect(accepted?.sentimentScore).toBe(40);
  });

  it("rejects impossible calendar dates instead of treating them as current", async () => {
    const result = await collectAiResearchMarketEvents({
      artists: [artist],
      runDate: "2026-07-11",
      apiKey: "test-key",
      delayMs: 0,
      fetchImpl: async () => groqResponse(event({ eventDate: "2026-06-00" }))
    });

    expect(result.eventsByArtist[artist.id]).toBeUndefined();
  });

  it("uses a verified search-result publication date when the model omits one", async () => {
    const result = await collectAiResearchMarketEvents({
      artists: [artist],
      runDate: "2026-07-11",
      apiKey: "test-key",
      delayMs: 0,
      fetchImpl: async () => groqResponse(event({ eventDate: "" }), "2026-07-09T13:00:00Z")
    });

    expect(result.eventsByArtist[artist.id]?.[0]?.eventDate).toBe("2026-07-09");
  });

  it("opens a circuit instead of retrying every artist after a daily quota limit", async () => {
    let requestCount = 0;
    const result = await collectAiResearchMarketEvents({
      artists: [artist, { ...artist, id: "second", name: "Second Artist", ticker: "SECOND" }],
      runDate: "2026-07-11",
      apiKey: "test-key",
      delayMs: 5,
      fetchImpl: async () => {
        requestCount += 1;
        return new Response(
          JSON.stringify({ error: { message: "Rate limit reached. Please try again in 2h." } }),
          { status: 429 }
        );
      }
    });

    expect(requestCount).toBe(1);
    expect(result.warnings).toContain("AI research stopped because the provider's daily quota was exhausted.");
    expect(result.observations.filter((observation) => observation.metric === "request_error")).toHaveLength(2);
  });
});
