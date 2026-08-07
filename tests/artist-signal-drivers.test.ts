import { describe, expect, it } from "vitest";
import { getArtistSignalDrivers } from "@/lib/artist-signal-drivers";
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

    expect(drivers[0]).toMatchObject({ key: "youtube", contribution: -7 });
    expect(drivers[1]).toMatchObject({ key: "streaming", contribution: 4.9 });
    expect(drivers.find((driver) => driver.key === "news")?.contribution).toBe(2.1);
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
});
