import { describe, expect, it } from "vitest";
import { collectYoutubeMarketSignals } from "@/server/market/youtube-source";
import type { MarketUpdateArtist } from "@/server/market/daily-update";

const testArtist: MarketUpdateArtist = {
  id: "artist",
  name: "Artist",
  ticker: "ARTIST",
  currentPrice: 25,
  previousClose: 25,
  hypeScore: 50,
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

const channelId = "UC1234567890123456789012";

function youtubeResponse(viewCount: number) {
  return async () =>
    new Response(
      JSON.stringify({
        items: [
          {
            id: channelId,
            snippet: { title: "Artist" },
            statistics: {
              viewCount: String(viewCount),
              subscriberCount: "10000",
              videoCount: "100"
            }
          }
        ]
      }),
      { status: 200 }
    );
}

async function collect(viewCount: number, extraBaseline: Record<string, number> = {}) {
  return collectYoutubeMarketSignals({
    artists: [testArtist],
    runDate: "2026-07-30",
    apiKey: "test-key",
    externalIds: {
      [testArtist.id]: {
        artistId: testArtist.id,
        youtubeChannelId: channelId
      }
    },
    baselines: {
      [testArtist.id]: {
        channel_views: 1_000_000,
        channel_views__age_days: 1,
        channel_views__recent_daily_rate: 10_000,
        channel_views__recent_rate_samples: 5,
        subscriber_count: 10_000,
        subscriber_count__age_days: 1,
        video_count: 100,
        video_count__age_days: 1,
        ...extraBaseline
      }
    },
    delayMs: 0,
    fetchImpl: youtubeResponse(viewCount)
  });
}

describe("YouTube audience velocity", () => {
  it("marks growth below the artist's usual pace as negative even when total views rise", async () => {
    const result = await collect(1_005_000);
    const signal = result.signals[testArtist.id];

    expect(signal.stats.youtubeGrowth).toBeLessThan(0);
    expect(signal.rawPayload.viewRateMomentum).toBeLessThan(0);
    expect(signal.rawPayload.velocityMinimumTickEligible).toBe(true);
  });

  it("marks growth above the artist's usual pace as positive", async () => {
    const result = await collect(1_015_000);
    const signal = result.signals[testArtist.id];

    expect(signal.stats.youtubeGrowth).toBeGreaterThan(0);
    expect(signal.rawPayload.viewRateMomentum).toBeGreaterThan(0);
  });

  it("uses year-over-year velocity when a real annual comparison exists", async () => {
    const withoutAnnual = await collect(1_010_000);
    const withAnnual = await collect(1_010_000, {
      channel_views__year_ago_daily_rate: 20_000,
      channel_views__year_ago_rate_samples: 4
    });
    const annualQuality = withAnnual.signals[testArtist.id].rawPayload.viewRateMomentumQuality as {
      annualRateChangePercent: number;
    };

    expect(annualQuality.annualRateChangePercent).toBe(-50);
    expect(withAnnual.signals[testArtist.id].stats.youtubeGrowth).toBeLessThan(
      withoutAnnual.signals[testArtist.id].stats.youtubeGrowth ?? 0
    );
  });
});
