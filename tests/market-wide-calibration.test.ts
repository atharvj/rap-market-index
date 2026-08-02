import { describe, expect, it } from "vitest";
import { mergeAdapterSignals } from "@/server/market/daily-update";
import type { AdapterSignals } from "@/server/market/market-data";
import { calibratePersistedMarketStats } from "@/server/market/market-wide-calibration";

function sourceSignals(
  source: string,
  values: number[],
  key: "streamingGrowth" | "youtubeGrowth" = "streamingGrowth"
): AdapterSignals {
  return Object.fromEntries(
    values.map((value, index) => [
      `artist-${index}`,
      {
        stats: { [key]: value },
        rawPayload: { source },
        confidence: 0.8
      }
    ])
  );
}

describe("market-wide source calibration", () => {
  it("cleans a stored market-wide bias so it cannot linger after the source recovers", () => {
    const artists = Array.from({ length: 20 }, (_, index) => ({
      id: `artist-${index}`,
      stats: {
        streamingGrowth: -10 + index * 0.4,
        youtubeGrowth: index % 2 ? 1 : -1,
        searchGrowth: 0,
        socialGrowth: 0,
        newsScore: 50,
        traderDemand: 0
      }
    }));
    const result = calibratePersistedMarketStats(artists);
    const listening = result.artists.map((artist) => artist.stats.streamingGrowth).sort((a, b) => a - b);

    expect((listening[9] + listening[10]) / 2).toBeCloseTo(0, 8);
    expect(result.audits["artist-0"].streamingGrowth).toMatchObject({
      rawValue: -10,
      sampleCount: 20,
      coverageRatio: 1,
      directionalBreadth: 1
    });
    expect(result.audits["artist-0"].youtubeGrowth).toBeUndefined();
  });

  it("removes an all-market provider shift while preserving artist differences", () => {
    const rawValues = Array.from({ length: 20 }, (_, index) => -10 + index * 0.4);
    const merged = mergeAdapterSignals(sourceSignals("lastfm", rawValues));
    const adjusted = Object.values(merged).map((signal) => signal.stats.streamingGrowth ?? 0);
    const sorted = [...adjusted].sort((left, right) => left - right);
    const median = (sorted[9] + sorted[10]) / 2;

    expect(median).toBeCloseTo(0, 8);
    expect(adjusted.some((value) => value > 0)).toBe(true);
    expect(adjusted.some((value) => value < 0)).toBe(true);
    expect(adjusted[19] - adjusted[0]).toBeCloseTo(rawValues[19] - rawValues[0], 8);
    expect(merged["artist-0"].rawPayload).toMatchObject({
      lastfm: {
        marketWideCalibration: {
          version: 1,
          reason: "source_wide_directional_shift",
          metrics: {
            streamingGrowth: {
              rawValue: rawValues[0],
              sampleCount: 20,
              coverageRatio: 1,
              directionalBreadth: 1
            }
          }
        }
      }
    });
  });

  it("catches a broad shift even when a small minority moves the other way", () => {
    const values = [...Array(18).fill(-5), 1, 2];
    const merged = mergeAdapterSignals(sourceSignals("lastfm", values));

    expect(merged["artist-0"].stats.streamingGrowth).toBeCloseTo(0, 8);
    expect(merged["artist-19"].stats.streamingGrowth).toBeCloseTo(7, 8);
    expect(merged["artist-0"].rawPayload).toHaveProperty("lastfm.marketWideCalibration");
  });

  it("does not rebalance an already mixed quantitative signal", () => {
    const values = Array.from({ length: 20 }, (_, index) => index - 9.5);
    const merged = mergeAdapterSignals(sourceSignals("lastfm", values));

    expect(merged["artist-0"].stats.streamingGrowth).toBe(values[0]);
    expect(merged["artist-0"].rawPayload).not.toHaveProperty("lastfm.marketWideCalibration");
  });

  it("does not normalize selected event coverage into artificial negatives", () => {
    const merged = mergeAdapterSignals(sourceSignals("market_events", Array(20).fill(8)));

    expect(merged["artist-0"].stats.streamingGrowth).toBe(8);
    expect(merged["artist-0"].rawPayload).not.toHaveProperty("market_events.marketWideCalibration");
  });

  it("does not normalize a sparse source against a larger market", () => {
    const lastfm = sourceSignals("lastfm", Array(10).fill(-6));
    const youtube = sourceSignals("youtube", Array(20).fill(0), "youtubeGrowth");
    const merged = mergeAdapterSignals(lastfm, youtube);

    expect(merged["artist-0"].stats.streamingGrowth).toBeCloseTo(-6, 8);
    expect(merged["artist-0"].rawPayload).not.toHaveProperty("lastfm.marketWideCalibration");
  });
});
