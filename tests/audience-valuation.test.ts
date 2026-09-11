import { describe, expect, it } from "vitest";
import { calculateAudienceValuation } from "@/lib/audience-valuation";
import { calculateYoutubeStarterPrice } from "@/lib/starter-valuation";
import { buildAudienceScaleCalibration } from "@/server/market/audience-scale";

describe("shared audience valuation", () => {
  it("uses verified Spotify reach with independent platform evidence", () => {
    const result = calculateAudienceValuation({ monthlyListeners: 821786, lastfmListeners: 71293, lastfmPlays: 3037722, youtubeSubscribers: 27100, youtubeViews: 4417177 });
    expect(result.targetPrice).toBe(38);
    expect(result.directSourceCount).toBe(3);
    expect(result.metrics.find(metric => metric.key === "spotify_monthly_listeners")?.weight).toBe(0.5);
  });

  it.each([20_000, 200_000, 2_000_000, 20_000_000])("is monotonic across audience sizes starting at %s", count => {
    const inputs = { monthlyListeners: count, lastfmListeners: count / 4, youtubeSubscribers: count / 8, youtubeViews: count * 20 };
    const larger = Object.fromEntries(Object.entries(inputs).map(([key, value]) => [key, value * 2]));
    expect(calculateAudienceValuation(larger).targetPrice).toBeGreaterThan(calculateAudienceValuation(inputs).targetPrice!);
  });

  it("uses the identical method for listing, reset and ongoing diagnostics", () => {
    const youtubeSubscribers = 114_000, youtubeViews = 50_852_406;
    const price = calculateAudienceValuation({ youtubeSubscribers, youtubeViews }).targetPrice;
    expect(calculateYoutubeStarterPrice({ subscribers: youtubeSubscribers, views: youtubeViews })).toBe(price);
    expect(buildAudienceScaleCalibration({ stats: {}, rawPayload: { youtube: { subscriberCount: youtubeSubscribers, viewCount: youtubeViews } } }).targetPrice).toBe(price);
  });

  it("reports missing coverage instead of treating missing or invalid inputs as zero", () => {
    const partial = calculateAudienceValuation({ monthlyListeners: 1_000_000 });
    const invalid = calculateAudienceValuation({ monthlyListeners: 1_000_000, youtubeViews: NaN, lastfmPlays: -1, youtubeSubscribers: Infinity });
    expect(partial).toEqual(invalid);
    expect(partial.coverage).toBe(0.5);
    expect(partial.confidence).toBeLessThan(calculateAudienceValuation({ monthlyListeners: 1_000_000, youtubeSubscribers: 100_000 }).confidence);
    expect(calculateAudienceValuation({}).targetPrice).toBeNull();
  });

  it("does not let publicity or quarantined video restatements inflate audience value", () => {
    const normal = { stats: {}, rawPayload: { lastfm: { listeners: 100_000, playcount: 2_000_000 } } };
    expect(buildAudienceScaleCalibration({ ...normal, rawPayload: { ...normal.rawPayload, wikimedia: { pageviews7d: 10_000_000 } } })).toEqual(buildAudienceScaleCalibration(normal));
    expect(buildAudienceScaleCalibration({ ...normal, rawPayload: { ...normal.rawPayload, youtube: { viewCount: 20_000_000_000, viewMomentumQuality: { anomalyFlags: ["implausible_counter_restatement"] } } } })).toEqual(buildAudienceScaleCalibration(normal));
  });
});
