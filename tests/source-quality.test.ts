import { describe, expect, it } from "vitest";
import { calculateRateMomentum, getBaselineAgeDays } from "@/server/market/source-quality";

describe("source observation timing", () => {
  it("uses exact elapsed time when the latest observation timestamp is available", () => {
    const observedAtMilliseconds = Date.now() - 36 * 60 * 60 * 1000;

    expect(getBaselineAgeDays({
      playcount__age_days: 2,
      playcount__observed_at_ms: observedAtMilliseconds
    }, "playcount")).toBeCloseTo(1.5, 3);
  });

  it("falls back to calendar age for older baselines without a timestamp", () => {
    expect(getBaselineAgeDays({ playcount__age_days: 3 }, "playcount")).toBe(3);
  });
});

describe("cumulative counter quality", () => {
  it("does not turn one cached flat counter sample into a full activity collapse", () => {
    const result = calculateRateMomentum({
      current: 1_000_000,
      baseline: 1_000_000,
      baselineAgeDays: 1,
      recentDailyRate: 25_000,
      recentRateSamples: 5,
      multiplier: 0.18,
      min: -18,
      max: 18
    });

    expect(result.value).toBeUndefined();
    expect(result.anomalyFlags).toContain("flat_counter_sample");
  });

  it("still detects a genuine slowdown when the counter rises below its usual pace", () => {
    const result = calculateRateMomentum({
      current: 1_005_000,
      baseline: 1_000_000,
      baselineAgeDays: 1,
      recentDailyRate: 25_000,
      recentRateSamples: 5,
      multiplier: 0.18,
      min: -18,
      max: 18
    });

    expect(result.value).toBeLessThan(0);
    expect(result.anomalyFlags).not.toContain("flat_counter_sample");
  });
});
