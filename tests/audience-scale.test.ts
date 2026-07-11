import { describe, expect, it } from "vitest";
import {
  applyAudienceScaleRebase,
  attachAudienceScaleCalibration,
  buildAudienceScaleCalibration,
  getAudienceScaleAdjustment
} from "@/server/market/audience-scale";
import type { MarketUpdateArtist } from "@/server/market/daily-update";

const emptyStats = {
  streamingGrowth: 0,
  youtubeGrowth: 0,
  searchGrowth: 0,
  socialGrowth: 0,
  newsScore: 50,
  traderDemand: 0
};

function signal(rawPayload: Record<string, unknown>) {
  return { stats: {}, rawPayload };
}

function artist(id: string): MarketUpdateArtist {
  return {
    id,
    name: id,
    ticker: id.toUpperCase().slice(0, 8),
    currentPrice: 20,
    previousClose: 20,
    hypeScore: 50,
    volatility: 1,
    category: "rising",
    stats: emptyStats
  };
}

describe("audience-scale valuation", () => {
  it("requires more than one direct audience metric", () => {
    const calibration = buildAudienceScaleCalibration(signal({
      lastfm: { listeners: 500_000 }
    }));

    expect(calibration.status).toBe("insufficient_data");
    expect(calibration.targetPrice).toBeNull();
  });

  it("assigns a higher target to consistently larger audiences", () => {
    const smaller = buildAudienceScaleCalibration(signal({
      lastfm: { listeners: 80_000, playcount: 2_000_000 },
      youtube: { subscriberCount: 12_000, viewCount: 3_000_000 }
    }));
    const larger = buildAudienceScaleCalibration(signal({
      lastfm: { listeners: 3_000_000, playcount: 900_000_000 },
      youtube: { subscriberCount: 8_000_000, viewCount: 4_000_000_000 }
    }));

    expect(smaller.status).toBe("ok");
    expect(larger.status).toBe("ok");
    expect(larger.targetPrice ?? 0).toBeGreaterThan(smaller.targetPrice ?? 0);
  });

  it("caps normal daily valuation pressure at four percent", () => {
    const result = getAudienceScaleAdjustment({
      audienceScaleCalibration: {
        status: "ok",
        targetPrice: 140,
        coverage: 1,
        rebase: false
      }
    }, 5);

    expect(result.adjustment).toBe(0.04);
  });

  it("applies a one-time rebase toward the universal target", () => {
    const result = applyAudienceScaleRebase({
      rawPayload: {
        audienceScaleCalibration: {
          status: "ok",
          targetPrice: 23,
          coverage: 0.95,
          rebase: true
        }
      },
      oldPrice: 15,
      regularPrice: 15.15
    });

    expect(result.applied).toBe(true);
    expect(result.price).toBeGreaterThan(15);
    expect(result.price).toBeLessThanOrEqual(23.23);
  });

  it("only rebases artists selected for the model transition", () => {
    const signals = attachAudienceScaleCalibration({
      artists: [artist("one"), artist("two")],
      signals: {
        one: signal({
          lastfm: { listeners: 500_000, playcount: 30_000_000 },
          youtube: { subscriberCount: 100_000, viewCount: 50_000_000 }
        }),
        two: signal({
          lastfm: { listeners: 600_000, playcount: 40_000_000 },
          youtube: { subscriberCount: 120_000, viewCount: 60_000_000 }
        })
      },
      rebaseArtistIds: new Set(["two"])
    });

    expect((signals.one.rawPayload.audienceScaleCalibration as { rebase: boolean }).rebase).toBe(false);
    expect((signals.two.rawPayload.audienceScaleCalibration as { rebase: boolean }).rebase).toBe(true);
  });
});
