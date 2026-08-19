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
  it("holds a new listing at its verified opening quote while sources establish baselines", () => {
    const current = {
      ...artist(),
      currentPrice: 45.66,
      quotedPrice: 45.66,
      previousClose: 45.66,
      baselineOnly: true
    };
    const result = calculateDailyMarketUpdates({
      artists: [current],
      runDate: "2026-08-19",
      source: "core",
      adapterSignals: {
        artist: {
          stats: { youtubeGrowth: -0.4 },
          rawPayload: {
            audienceScaleCalibration: {
              status: "ok",
              targetPrice: 30,
              coverage: 1,
              confidence: 0.9
            },
            sourceWeights: { youtube: { youtubeGrowth: 0.8 } },
            sourceValues: { youtube: { youtubeGrowth: -0.4 } }
          }
        }
      }
    });

    expect(result.updates[0]).toMatchObject({
      currentPrice: 45.66,
      previousClose: 45.66,
      dailyChangePercent: 0,
      signalDelta: 0
    });
    expect(result.updates[0].rawPayload).toMatchObject({
      hasMomentumSignal: false,
      openingBaselineHold: {
        applied: true,
        openingPrice: 45.66
      }
    });
    expect(result.updates[0].explanation).toContain("opening source baseline");
    expect(result.summary).toMatchObject({
      momentumArtistCount: 0,
      upMoveCount: 0,
      downMoveCount: 0,
      flatMoveCount: 1
    });
  });

  it("holds the live quote during an intraday calculation with no new pricing signal", () => {
    const current = {
      ...artist(),
      currentPrice: 5,
      quotedPrice: 5.12,
      previousClose: 5
    };
    const result = calculateDailyMarketUpdates({
      artists: [current],
      runDate: "2026-07-13",
      source: "core",
      intraday: true
    });

    expect(result.updates[0]).toMatchObject({ currentPrice: 5.12, signalDelta: 0 });
    expect(result.updates[0].dailyChangePercent).toBeCloseTo(2.4);
    expect(result.updates[0].rawPayload.intradayHold).toMatchObject({
      applied: true,
      reason: "no_new_intraday_pricing_signal"
    });
  });

  it("tracks missing history separately from genuine source anomalies", () => {
    const result = calculateDailyMarketUpdates({
      artists: [artist()],
      runDate: "2026-07-13",
      source: "blended",
      adapterSignals: {
        artist: {
          stats: { youtubeGrowth: 0.2 },
          rawPayload: {
            sourceWeights: { youtube: { youtubeGrowth: 0.8 } },
            sourceValues: { youtube: { youtubeGrowth: 0.2 } },
            youtube: {
              viewRateMomentum: {
                confidenceMultiplier: 0.42,
                anomalyFlags: ["missing_rate_baseline"]
              },
              annualPopularityMomentum: {
                confidenceMultiplier: 0.42,
                anomalyFlags: ["missing_annual_baseline"]
              }
            }
          }
        }
      }
    });

    expect(result.summary).toMatchObject({
      sourceQualityDiagnosticsVersion: 2,
      sourceQualityAnomalyCount: 0,
      sourceQualityAnomalousArtistCount: 0,
      sourceQualityMissingBaselineCount: 2
    });
  });

  it("still reports genuine counter anomalies and affected artists", () => {
    const result = calculateDailyMarketUpdates({
      artists: [artist()],
      runDate: "2026-07-13",
      source: "blended",
      adapterSignals: {
        artist: {
          stats: { youtubeGrowth: -0.2 },
          rawPayload: {
            sourceWeights: { youtube: { youtubeGrowth: 0.8 } },
            sourceValues: { youtube: { youtubeGrowth: -0.2 } },
            youtube: {
              viewRateMomentum: {
                confidenceMultiplier: 0.42,
                anomalyFlags: ["counter_drop"]
              }
            }
          }
        }
      }
    });

    expect(result.summary).toMatchObject({
      sourceQualityDiagnosticsVersion: 2,
      sourceQualityAnomalyCount: 1,
      sourceQualityAnomalousArtistCount: 1,
      sourceQualityMissingBaselineCount: 0
    });
  });

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

  it("can preserve a one-cent move from one high-confidence measured audience velocity signal", () => {
    const result = calculateDailyMarketUpdates({
      artists: [artist()],
      runDate: "2026-07-13",
      source: "blended",
      adapterSignals: {
        artist: {
          stats: {
            youtubeGrowth: -0.2,
            socialGrowth: -0.2
          },
          rawPayload: {
            youtube: {
              velocityMinimumTickEligible: true
            },
            sourceWeights: {
              youtube: { youtubeGrowth: 0.8, socialGrowth: 0.4 }
            },
            sourceValues: {
              youtube: { youtubeGrowth: -0.2, socialGrowth: -0.2 }
            },
            sourceDirectionalScores: {
              youtube: -0.2
            }
          }
        }
      }
    });
    const update = result.updates[0];

    expect(update.currentPrice).toBe(4.99);
    expect(update.rawPayload.measuredMinimumTick).toMatchObject({
      applied: true,
      sourceCount: 1,
      evidenceMode: "measured_audience_velocity"
    });
    expect(update.explanation).toContain("below its recent pace");
  });
});
