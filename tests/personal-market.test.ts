import { describe, expect, it } from "vitest";
import { createInitialGameState } from "@/lib/market";
import {
  buildArtistRecap,
  getArtistWeek,
  getTrackedArtists,
  isMarketDate,
  shiftReviewDate,
} from "@/lib/personal-market";
const artist = createInitialGameState().artists[0];
const point = (date: string, price: number, recordedPrice = price) => ({
  date,
  price,
  recordedPrice,
});
describe("personal artist review", () => {
  it("uses calendar dates across leap days and year boundaries", () => {
    expect(isMarketDate("2026-02-29")).toBe(false);
    expect(isMarketDate("2028-02-29")).toBe(true);
    expect(isMarketDate("2026-1-01")).toBe(false);
    expect(shiftReviewDate("2027-01-02", -7)).toBe("2026-12-26");
    expect(shiftReviewDate("2028-03-01", -1)).toBe("2028-02-29");
  });
  it("deduplicates and sorts recorded points, excluding invalid and future prices", () => {
    const week = getArtistWeek(
      {
        ...artist,
        priceHistory: [
          point("2026-11-07", 110),
          point("2026-11-08", 999),
          point("2026-11-03", NaN),
          point("2026-11-04", 0),
          point("invalid", 1),
          point("2026-10-31", 90),
          point("2026-10-31", 100),
        ],
      },
      "2026-11-07",
    );
    expect(week).toMatchObject({
      startDate: "2026-10-31",
      endDate: "2026-11-07",
      days: 7,
    });
    expect(week!.changePercent).toBeCloseTo(10);
  });
  it("labels a shorter available range and never turns a month-long gap into a week", () => {
    const partial = getArtistWeek(
      {
        ...artist,
        priceHistory: [point("2026-11-04", 100), point("2026-11-07", 99)],
      },
      "2026-11-07",
    );
    expect(partial).toMatchObject({ days: 3, startDate: "2026-11-04" });
    expect(partial!.changePercent).toBeCloseTo(-1);
    expect(
      getArtistWeek(
        {
          ...artist,
          priceHistory: [point("2026-10-01", 100), point("2026-11-07", 99)],
        },
        "2026-11-07",
      ),
    ).toBeNull();
    expect(getArtistWeek(artist, "bad")).toBeNull();
  });
  it("uses the canonical scale so a valuation correction is not a gain", () => {
    const week = getArtistWeek(
      {
        ...artist,
        priceHistory: [point("2026-10-31", 100, 10), point("2026-11-07", 100)],
      },
      "2026-11-07",
    );
    expect(week!.changePercent).toBe(0);
  });
  it("includes watchlist, longs and shorts once and ignores unknown artists", () => {
    const artists = createInitialGameState().artists.slice(0, 3);
    expect(
      getTrackedArtists(
        artists,
        [artists[0].id, "missing"],
        [{ artistId: artists[1].id, shares: 1, averageBuyPrice: 1 }],
        [
          {
            artistId: artists[2].id,
            shares: 1,
            averageShortPrice: 1,
            collateral: 1,
          },
        ],
      ).map((a) => a.id),
    ).toEqual(artists.map((a) => a.id));
  });
  it("shares public quote performance with exact dates, never private account fields", () => {
    const week = getArtistWeek(
      {
        ...artist,
        priceHistory: [point("2026-10-31", 100), point("2026-11-07", 110)],
      },
      "2026-11-07",
    )!;
    const recap = buildArtistRecap([week], "2026-11-07");
    expect(recap).toContain(`${artist.name} ($${artist.ticker}): +10.00%`);
    expect(recap).toContain("2026-10-31 to 2026-11-07");
    expect(recap).not.toMatch(
      /balance|holdings|shares|portfolio value|trade fills/i,
    );
  });
});
