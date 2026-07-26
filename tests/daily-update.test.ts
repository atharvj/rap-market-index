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

  it("restores a one-cent move when corroborated measured signals were lost to rounding", () => {
    const result = calculateDailyMarketUpdates({
      artists: [artist()],
      runDate: "2026-07-13",
      source: "blended",
      adapterSignals: {
        artist: {
          stats: {
            streamingGrowth: 0.2,
            youtubeGrowth: 0.2
          },
          rawPayload: {
            sourceWeights: {
              lastfm: { streamingGrowth: 0.8 },
              youtube: { youtubeGrowth: 0.8 }
            },
            sourceValues: {
              lastfm: { streamingGrowth: 0.2 },
              youtube: { youtubeGrowth: 0.2 }
            },
            sourceDirectionalScores: {
              lastfm: 0.2,
              youtube: 0.2
            }
          }
        }
      }
    });
    const update = result.updates[0];

    expect(update.currentPrice).toBe(5.01);
    expect(update.dailyChangePercent).toBeGreaterThan(0);
    expect(update.rawPayload.measuredMinimumTick).toMatchObject({
      applied: true,
      sourceCount: 2,
      statCount: 2
    });
    expect(update.explanation).toContain("corroborated measured signals");
  });

  it("can restore a downward tick when corroborated measured signals weaken", () => {
    const result = calculateDailyMarketUpdates({
      artists: [artist()],
      runDate: "2026-07-13",
      source: "blended",
      adapterSignals: {
        artist: {
          stats: {
            streamingGrowth: -0.2,
            youtubeGrowth: -0.2
          },
          rawPayload: {
            sourceWeights: {
              lastfm: { streamingGrowth: 0.8 },
              youtube: { youtubeGrowth: 0.8 }
            },
            sourceValues: {
              lastfm: { streamingGrowth: -0.2 },
              youtube: { youtubeGrowth: -0.2 }
            },
            sourceDirectionalScores: {
              lastfm: -0.2,
              youtube: -0.2
            }
          }
        }
      }
    });
    const update = result.updates[0];

    expect(update.currentPrice).toBe(4.99);
    expect(update.dailyChangePercent).toBeLessThan(0);
    expect(update.rawPayload.measuredMinimumTick).toMatchObject({ applied: true });
  });

  it("does not manufacture a minimum move from one source", () => {
    const result = calculateDailyMarketUpdates({
      artists: [artist()],
      runDate: "2026-07-13",
      source: "blended",
      adapterSignals: {
        artist: {
          stats: {
            streamingGrowth: 0.2,
            socialGrowth: 0.2
          },
          rawPayload: {
            sourceWeights: {
              lastfm: { streamingGrowth: 0.8, socialGrowth: 0.4 }
            },
            sourceValues: {
              lastfm: { streamingGrowth: 0.2, socialGrowth: 0.2 }
            },
            sourceDirectionalScores: {
              lastfm: 0.2
            }
          }
        }
      }
    });
    const update = result.updates[0];

    expect(update.currentPrice).toBe(5);
    expect(update.dailyChangePercent).toBe(0);
    expect(update.rawPayload.measuredMinimumTick).toMatchObject({
      applied: false,
      sourceCount: 1
    });
  });
});
