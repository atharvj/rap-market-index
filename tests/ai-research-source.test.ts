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

function groqResponse(event: Record<string, unknown>, publishedDate?: string, searchUrl?: string) {
  const url = searchUrl ?? "https://www.billboard.com/music/rb-hip-hop/ken-carson-new-album-123";

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
  it("bounds model scores to publisher-backed deterministic classification", async () => {
    const result = await collectAiResearchMarketEvents({
      artists: [artist],
      runDate: "2026-07-11",
      apiKey: "test-key",
      delayMs: 0,
      fetchImpl: createAiFetch(event())
    });
    const accepted = result.eventsByArtist[artist.id]?.[0];

    expect(accepted).toBeDefined();
    expect(Math.abs(accepted?.impactScore ?? 0)).toBeLessThanOrEqual(48);
    expect(accepted?.rawPayload).toMatchObject({
      evidenceVersion: 2,
      publisherArticleVerified: true,
      publisherDateVerified: true,
      publisherHeadlineVerified: true,
      publicReactionConfirmed: false,
      musicDemandConfirmed: false
    });
  });

  it("rejects an old publisher article even when the model claims a current date", async () => {
    const result = await collectAiResearchMarketEvents({
      artists: [artist],
      runDate: "2026-07-11",
      apiKey: "test-key",
      delayMs: 0,
      fetchImpl: createAiFetch(event({ eventDate: "2026-07-10" }), {
        publisherDate: "2024-11-26"
      })
    });

    expect(result.eventsByArtist[artist.id]).toBeUndefined();
  });

  it("uses the publisher date instead of model or search-result freshness", async () => {
    const result = await collectAiResearchMarketEvents({
      artists: [artist],
      runDate: "2026-07-11",
      apiKey: "test-key",
      delayMs: 0,
      fetchImpl: createAiFetch(event({ eventDate: "2026-07-10" }), {
        searchPublishedDate: "2026-07-10T13:00:00Z",
        publisherDate: "2026-07-09T13:00:00Z"
      })
    });

    expect(result.eventsByArtist[artist.id]?.[0]?.eventDate).toBe("2026-07-09");
  });

  it("rejects a verified lifestyle launch with no demonstrated music demand", async () => {
    const result = await collectAiResearchMarketEvents({
      artists: [artist],
      runDate: "2026-07-11",
      apiKey: "test-key",
      delayMs: 0,
      fetchImpl: createAiFetch(event({
        title: "Ken Carson launches debut fragrance at a beauty retailer",
        summary: "The artist launched a fragrance.",
        eventType: "news",
        marketConnection: "attention_only",
        musicDemandConfirmed: false
      }), {
        publisherHeadline: "Ken Carson launches debut fragrance at a beauty retailer",
        publisherSummary: "Ken Carson launched a fragrance at a beauty retailer."
      })
    });

    expect(result.eventsByArtist[artist.id]).toBeUndefined();
  });

  it("rejects the exact Kendrick-style artist archive regression", async () => {
    const archiveUrl = "https://pitchfork.com/artists/29812-kendrick-lamar";
    const kendrick = { ...artist, id: "kendrick-lamar", name: "Kendrick Lamar", ticker: "KDOT" };
    const result = await collectAiResearchMarketEvents({
      artists: [kendrick],
      runDate: "2026-08-09",
      apiKey: "test-key",
      delayMs: 0,
      fetchImpl: createAiFetch(event({
        title: "Kendrick Lamar's GNX Continues to Receive Critical Acclaim",
        eventDate: "2026-08-07",
        eventType: "review",
        sourceName: "Pitchfork",
        sourceUrl: archiveUrl,
        summary: "GNX continues to receive acclaim.",
        impactScore: 70,
        confidence: 0.9
      }), {
        sourceUrl: archiveUrl,
        archivePage: true,
        searchPublishedDate: "2026-08-07"
      })
    });

    expect(result.eventsByArtist[kendrick.id]).toBeUndefined();
    expect(
      result.observations.find((observation) => observation.metric === "event_count")?.rawPayload
    ).toMatchObject({
      rejectedCandidateReasons: { non_article_page: 1 }
    });
  });

  it("does not treat an ancestor search-result URL as an exact source match", async () => {
    const result = await collectAiResearchMarketEvents({
      artists: [artist],
      runDate: "2026-07-11",
      apiKey: "test-key",
      delayMs: 0,
      fetchImpl: createAiFetch(event({
        sourceUrl: "https://www.billboard.com/music/rb-hip-hop/ken-carson-new-album-123"
      }), {
        searchUrl: "https://www.billboard.com/music/rb-hip-hop"
      })
    });

    expect(result.eventsByArtist[artist.id]).toBeUndefined();
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

function createAiFetch(
  candidate: Record<string, unknown>,
  {
    sourceUrl = String(candidate.sourceUrl),
    searchUrl = sourceUrl,
    searchPublishedDate,
    publisherDate = "2026-07-10T13:00:00Z",
    publisherHeadline = "Ken Carson announces a new album",
    publisherSummary = "Ken Carson announced a new album.",
    archivePage = false
  }: {
    sourceUrl?: string;
    searchUrl?: string;
    searchPublishedDate?: string;
    publisherDate?: string;
    publisherHeadline?: string;
    publisherSummary?: string;
    archivePage?: boolean;
  } = {}
): typeof fetch {
  return async (input) => {
    const url = String(input);

    if (url === "https://api.groq.com/openai/v1/chat/completions") {
      return groqResponse(candidate, searchPublishedDate, searchUrl);
    }

    if (url === sourceUrl) {
      if (archivePage) {
        return htmlResponse(`
          <html><head>
            <link rel="canonical" href="${sourceUrl}"/>
            <meta property="og:type" content="website"/>
            <meta property="og:title" content="Kendrick Lamar - Albums, Songs, and News | Pitchfork"/>
            <script type="application/ld+json">
              {"@type":"Review","url":"https://pitchfork.com/reviews/albums/kendrick-lamar-gnx/","headline":"GNX","datePublished":"2024-11-26"}
            </script>
          </head><body><h1>Kendrick Lamar</h1></body></html>
        `);
      }

      return htmlResponse(`
        <html><head>
          <link rel="canonical" href="${sourceUrl}"/>
          <meta property="og:type" content="article"/>
          <meta property="og:title" content="${publisherHeadline}"/>
          <meta property="og:description" content="${publisherSummary}"/>
          <script type="application/ld+json">
            ${JSON.stringify({
              "@type": "NewsArticle",
              url: sourceUrl,
              headline: publisherHeadline,
              datePublished: publisherDate
            })}
          </script>
        </head></html>
      `);
    }

    throw new Error(`Unexpected AI research request: ${url}`);
  };
}

function htmlResponse(html: string) {
  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html" }
  });
}
