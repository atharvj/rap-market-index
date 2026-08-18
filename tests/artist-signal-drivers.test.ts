import { describe, expect, it } from "vitest";
import { formatArtistMomentumContribution, getArtistSignalDrivers } from "@/lib/artist-signal-drivers";
import { calculateHypeScore } from "@/lib/pricing";

describe("artist signal drivers", () => {
  it("ranks the largest weighted model inputs first", () => {
    const drivers = getArtistSignalDrivers({
      streamingGrowth: 10,
      youtubeGrowth: -20,
      searchGrowth: 8,
      socialGrowth: 4,
      newsScore: 60,
      traderDemand: 2
    });

    expect(drivers[0].key).toBe("youtube");
    expect(drivers[0].contribution).toBeCloseTo(-7, 8);
    expect(drivers[1].key).toBe("streaming");
    expect(drivers[1].contribution).toBeCloseTo(4.9, 8);
    expect(drivers.find((driver) => driver.key === "news")?.contribution).toBeCloseTo(2.1, 8);
  });

  it("adds up to the unrounded score movement from neutral", () => {
    const stats = {
      streamingGrowth: 10,
      youtubeGrowth: -4,
      searchGrowth: 8,
      socialGrowth: 4,
      newsScore: 60,
      traderDemand: 2
    };
    const contribution = getArtistSignalDrivers(stats)
      .reduce((total, driver) => total + driver.contribution, 0);

    expect(contribution).toBeCloseTo(7.14, 2);
    expect(Math.round(50 + contribution)).toBe(calculateHypeScore(stats));
  });

  it("keeps neutral signals at zero", () => {
    expect(getArtistSignalDrivers({
      streamingGrowth: 0,
      youtubeGrowth: 0,
      searchGrowth: 0,
      socialGrowth: 0,
      newsScore: 50,
      traderDemand: 0
    }).every((driver) => driver.contribution === 0)).toBe(true);
  });

  it("preserves and explains tiny real inputs instead of rounding them to zero", () => {
    const video = getArtistSignalDrivers({
      streamingGrowth: 0,
      youtubeGrowth: 0.0013,
      searchGrowth: 0,
      socialGrowth: 0.0005,
      newsScore: 50,
      traderDemand: 0
    }).find((driver) => driver.key === "youtube");

    expect(video?.contribution).toBeCloseTo(0.000455, 8);
    expect(formatArtistMomentumContribution(video?.contribution ?? 0)).toBe("Slight +");
    expect(formatArtistMomentumContribution(0)).toBe("Flat");
    expect(formatArtistMomentumContribution(-0.004)).toBe("Slight −");
  });
});
