import { describe, expect, it } from "vitest";
import { getBaselineAgeDays } from "@/server/market/source-quality";

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
