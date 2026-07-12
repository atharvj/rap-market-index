import { describe, expect, it } from "vitest";
import { calculateDailyMarketUpdates, type MarketUpdateArtist } from "@/server/market/daily-update";

const neutralStats = {
  streamingGrowth: 0,
  youtubeGrowth: 0,
  searchGrowth: 0,
  socialGrowth: 0,
  newsScore: 50,
  traderDemand: 0
};

function artist(): MarketUpdateArtist {
  return {
    id: "artist",
    name: "Artist",
    ticker: "ARTIST",
    currentPrice: 5,
    previousClose: 5,
    hypeScore: 50,
    volatility: 1,
    category: "rising",
    stats: neutralStats
  };
}

describe("daily market valuation pressure", () => {
  it("never treats a legacy rebase flag as an uncapped daily move", () => {
    const result = calculateDailyMarketUpdates({
      artists: [artist()],
      runDate: "2026-07-12",
      source: "core",
      adapterSignals: {
        artist: {
          stats: {},
          rawPayload: {
            audienceScaleCalibration: {
              status: "ok",
              targetPrice: 140,
              coverage: 1,
              confidence: 0.98,
              rebase: true
            }
          }
        }
      }
    });
    const update = result.updates[0];

    expect(update.currentPrice).toBeLessThan(5.1);
    expect(update.dailyChangePercent).toBeLessThan(2);
    expect(update.explanation).not.toContain("rebased");
    expect(update.rawPayload).not.toHaveProperty("audienceScaleRebaseApplied");
  });
});
