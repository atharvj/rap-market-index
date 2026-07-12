import { describe, expect, it } from "vitest";
import {
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

  it("assigns less confidence when all scale evidence comes from one platform", () => {
    const onePlatform = buildAudienceScaleCalibration(signal({
      youtube: { subscriberCount: 310_000, viewCount: 91_000_000 }
    }));
    const corroborated = buildAudienceScaleCalibration(signal({
      lastfm: { listeners: 206_000, playcount: 11_400_000 },
      youtube: { subscriberCount: 82_900, viewCount: 16_700_000 }
    }));

    expect(onePlatform.status).toBe("ok");
    expect(onePlatform.directSourceCount).toBe(1);
    expect(corroborated.directSourceCount).toBe(2);
    expect(onePlatform.confidence).toBeLessThan(corroborated.confidence);
  });

  it("ranks comparable artists from the same universal audience formula", () => {
    const tana = buildAudienceScaleCalibration(signal({
      youtube: { subscriberCount: 310_000, viewCount: 90_955_691 },
      wikimedia: { pageviews7d: 325 }
    }));
    const feng = buildAudienceScaleCalibration(signal({
      lastfm: { listeners: 389_464, playcount: 33_307_338 },
      youtube: { subscriberCount: 52_800, viewCount: 14_982_544 },
      wikimedia: { pageviews7d: 36 }
    }));
    const molly = buildAudienceScaleCalibration(signal({
      lastfm: { listeners: 206_371, playcount: 11_441_126 },
      youtube: { subscriberCount: 83_000, viewCount: 16_724_624 }
    }));

    expect(tana.targetPrice ?? 0).toBeGreaterThan(feng.targetPrice ?? 0);
    expect(feng.targetPrice ?? 0).toBeGreaterThan(molly.targetPrice ?? 0);
    expect(tana.confidence).toBeLessThan(feng.confidence);
  });

  it("caps normal daily valuation pressure at four percent", () => {
    const result = getAudienceScaleAdjustment({
      audienceScaleCalibration: {
        status: "ok",
        targetPrice: 140,
        coverage: 1
      }
    }, 5);

    expect(result.adjustment).toBe(0.04);
  });

  it("attaches the same valuation method without migration flags", () => {
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
      }
    });

    expect(signals.one.rawPayload.audienceScaleCalibration).toMatchObject({ status: "ok" });
    expect(signals.two.rawPayload.audienceScaleCalibration).toMatchObject({ status: "ok" });
    expect(signals.one.rawPayload.audienceScaleCalibration).not.toHaveProperty("rebase");
    expect(signals.two.rawPayload.audienceScaleCalibration).not.toHaveProperty("rebase");
  });
});
