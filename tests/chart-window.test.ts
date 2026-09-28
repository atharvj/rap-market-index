import { describe, expect, it } from "vitest";
import { buildMarketIndexSeries, buildPortfolioQuoteSeries } from "@/lib/market-analytics";
import { createInitialGameState } from "@/lib/market";

describe("shared chart window", () => {
  const artist = { ...createInitialGameState().artists[0], priceHistory: Array.from({ length: 94 }, (_, i) => ({
    date: new Date(Date.UTC(2026, 5, 26 + i)).toISOString().slice(0, 10), price: 50 + i
  })) };
  it("retains the three-month market and portfolio window instead of truncating it to 28 points", () => {
    expect(buildMarketIndexSeries([artist])).toHaveLength(94);
    expect(buildPortfolioQuoteSeries({ holdings: [{ artist, shares: 2 }] as never, shortPositions: [], cashBalance: 100 })).toHaveLength(94);
  });
  it("preserves explicit shorter requests", () => {
    expect(buildMarketIndexSeries([artist], 7)).toHaveLength(7);
  });
});
