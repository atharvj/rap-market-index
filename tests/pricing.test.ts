import { describe, expect, it } from "vitest";
import { calculateHypeScore } from "@/lib/pricing";

describe("RMI Score range", () => {
  it("keeps neutral evidence at the midpoint", () => {
    expect(calculateHypeScore({
      streamingGrowth: 0,
      youtubeGrowth: 0,
      searchGrowth: 0,
      socialGrowth: 0,
      newsScore: 50,
      traderDemand: 0
    })).toBe(50);
  });

  it("can reach the top of the range when measured signals are exceptionally strong", () => {
    expect(calculateHypeScore({
      streamingGrowth: 75,
      youtubeGrowth: 70,
      searchGrowth: 95,
      socialGrowth: 120,
      newsScore: 100,
      traderDemand: 40
    })).toBe(99);
  });

  it("can approach the bottom of the range when measured signals are exceptionally weak", () => {
    expect(calculateHypeScore({
      streamingGrowth: -25,
      youtubeGrowth: -25,
      searchGrowth: -30,
      socialGrowth: -35,
      newsScore: 0,
      traderDemand: -40
    })).toBeLessThanOrEqual(10);
  });
});
