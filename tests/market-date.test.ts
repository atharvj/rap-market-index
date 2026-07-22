import { describe, expect, it } from "vitest";
import {
  getMarketDate,
  getMarketDayBoundsUtc,
  getMarketLookbackBoundsUtc
} from "@/server/market/market-date";

describe("Eastern market calendar", () => {
  it("rolls to a new market date at midnight Eastern", () => {
    expect(getMarketDate(new Date("2026-07-22T03:59:59.000Z"))).toBe("2026-07-21");
    expect(getMarketDate(new Date("2026-07-22T04:00:00.000Z"))).toBe("2026-07-22");
  });

  it("handles daylight and standard time day bounds", () => {
    expect(getMarketDayBoundsUtc("2026-07-22")).toEqual({
      start: "2026-07-22T04:00:00.000Z",
      end: "2026-07-23T04:00:00.000Z"
    });
    expect(getMarketDayBoundsUtc("2026-01-22")).toEqual({
      start: "2026-01-22T05:00:00.000Z",
      end: "2026-01-23T05:00:00.000Z"
    });
  });

  it("builds lookback windows from Eastern midnights", () => {
    expect(getMarketLookbackBoundsUtc("2026-07-22", 2)).toEqual({
      start: "2026-07-20T04:00:00.000Z",
      end: "2026-07-22T04:00:00.000Z"
    });
  });
});
