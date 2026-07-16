import { describe, expect, it } from "vitest";
import {
  buildDailyPriceSeries,
  buildIntradayPriceSeries,
  hasPriceMovement,
  keepLatestMarketRunPerDate
} from "@/lib/price-series";

describe("price series", () => {
  it("collapses repeated intraday ticks while preserving the flat duration", () => {
    const points = buildIntradayPriceSeries({
      ticks: [
        { date: "2026-07-10T20:00:00.000Z", price: 6.54 },
        { date: "2026-07-10T21:00:00.000Z", price: 6.54 },
        { date: "2026-07-10T22:00:00.000Z", price: 6.54 }
      ],
      currentPrice: 6.54,
      now: "2026-07-11T01:00:00.000Z"
    });

    expect(points).toEqual([
      { date: "2026-07-10T20:00:00.000Z", price: 6.54 },
      { date: "2026-07-11T01:00:00.000Z", price: 6.54 }
    ]);
    expect(hasPriceMovement(points)).toBe(false);
  });

  it("keeps actual intraday price changes", () => {
    const points = buildIntradayPriceSeries({
      ticks: [
        { date: "2026-07-10T20:00:00.000Z", price: 12.81 },
        { date: "2026-07-10T21:00:00.000Z", price: 12.64 },
        { date: "2026-07-10T22:00:00.000Z", price: 12.79 }
      ],
      currentPrice: 12.79,
      now: "2026-07-11T01:00:00.000Z"
    });

    expect(points.map((point) => point.price)).toEqual([12.81, 12.64, 12.79, 12.79]);
    expect(hasPriceMovement(points)).toBe(true);
  });

  it("uses one closing quote per market date and replaces today's close with the live quote", () => {
    const points = buildDailyPriceSeries({
      dailyHistory: [
        { date: "2026-07-09", price: 133.62 },
        { date: "2026-07-10", price: 134.38 },
        { date: "2026-07-10T21:00:00.000Z", price: 999 }
      ],
      currentPrice: 134.41,
      marketDate: "2026-07-10"
    });

    expect(points).toEqual([
      { date: "2026-07-09", price: 133.62 },
      { date: "2026-07-10", price: 134.41 }
    ]);
  });

  it("does not present a live quote as a recorded daily close when disabled", () => {
    const points = buildDailyPriceSeries({
      dailyHistory: [
        { date: "2026-07-11", price: 20.12 },
        { date: "2026-07-14", price: 20.54 }
      ],
      currentPrice: 20.54,
      marketDate: "2026-07-16",
      includeCurrentQuote: false
    });

    expect(points).toEqual([
      { date: "2026-07-11", price: 20.12 },
      { date: "2026-07-14", price: 20.54 }
    ]);
  });

  it("removes superseded same-day market runs while preserving trade ticks", () => {
    expect(
      keepLatestMarketRunPerDate([
        {
          date: "2026-07-10T13:00:00.000Z",
          price: 12,
          source: "market_run",
          marketDate: "2026-07-10"
        },
        {
          date: "2026-07-10T16:00:00.000Z",
          price: 12.1,
          source: "trade",
          marketDate: "2026-07-10"
        },
        {
          date: "2026-07-10T18:00:00.000Z",
          price: 12.25,
          source: "market_run",
          marketDate: "2026-07-10"
        },
        {
          date: "2026-07-11T13:00:00.000Z",
          price: 12.4,
          source: "market_run",
          marketDate: "2026-07-11"
        }
      ])
    ).toEqual([
      { date: "2026-07-10T16:00:00.000Z", price: 12.1 },
      { date: "2026-07-10T18:00:00.000Z", price: 12.25 },
      { date: "2026-07-11T13:00:00.000Z", price: 12.4 }
    ]);
  });
});
