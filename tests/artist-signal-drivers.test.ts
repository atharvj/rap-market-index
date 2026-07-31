import { describe, expect, it } from "vitest";
import { getArtistSignalDrivers } from "@/lib/artist-signal-drivers";

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

    expect(drivers[0]).toMatchObject({ key: "youtube", contribution: -5 });
    expect(drivers[1]).toMatchObject({ key: "streaming", contribution: 3.5 });
    expect(drivers.find((driver) => driver.key === "news")?.contribution).toBe(0.75);
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
