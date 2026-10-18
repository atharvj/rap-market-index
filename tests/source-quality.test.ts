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

  it("does not replay a previous completed interval when a new day has no new counter change", () => {
    const result = calculateRateMomentum({
      current: 1_000_000,
      baseline: 1_000_000,
      baselineAgeDays: 0.08,
      recentDailyRate: 25_000,
      recentRateSamples: 4,
      latestCompletedDailyRate: 18_000,
      useCompletedIntervalFallback: true,
      multiplier: 0.18,
      min: -18,
      max: 18
    });

    expect(result.value).toBeUndefined();
    expect(result.rateObservationSource).toBeUndefined();
  });

  it("does not reuse completed daily momentum during intraday polling", () => {
    const result = calculateRateMomentum({
      current: 1_000_000,
      baseline: 1_000_000,
      baselineAgeDays: 0.08,
      recentDailyRate: 25_000,
      recentRateSamples: 4,
      latestCompletedDailyRate: 18_000,
      useCompletedIntervalFallback: false,
      multiplier: 0.18,
      min: -18,
      max: 18
    });

    expect(result.value).toBeUndefined();
    expect(result.anomalyFlags).toContain("missing_rate_baseline");
  });

  it("measures the actual elapsed half-day and long interval without a one-day floor or 30-day ceiling", () => {
    const calculate = (days: number) => calculateRateMomentum({ current: 1_000_000 + days * 10_000, baseline: 1_000_000,
      baselineAgeDays: days, recentDailyRate: 10_000, recentRateSamples: 5, multiplier: 0.18, min: -25, max: 55 });
    for (const days of [0.25, 0.5, 1, 40]) { expect(calculate(days).value).toBe(0); expect(calculate(days).currentDailyRate).toBe(10_000); }
  });

  it("withholds counter resets and invalid numbers rather than inventing audience rejection", () => {
    for (const current of [900_000, NaN, Infinity, -1]) {
      expect(calculateRateMomentum({ current, baseline: 1_000_000, baselineAgeDays: 1, recentDailyRate: 10_000,
        recentRateSamples: 5, multiplier: 0.18, min: -25, max: 55 }).value).toBeUndefined();
    }
  });
});
