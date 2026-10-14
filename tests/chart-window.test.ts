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

describe("different artist listing dates", () => {
  const template = createInitialGameState().artists[0];
  const earlier = { ...template, id: "earlier", priceHistory: [
    { date: "2026-10-01", price: 10 }, { date: "2026-10-02", price: 20 }, { date: "2026-10-03", price: 20 }
  ] };
  const later = { ...template, id: "later", priceHistory: [
    { date: "2026-10-02", price: 100 }, { date: "2026-10-03", price: 110 }
  ] };
  it("does not invent a flat pre-listing quote or dilute the earlier artist's return", () => {
    const index = buildMarketIndexSeries([earlier, later]);
    expect(index[0].price).toBe(100);
    expect(index[1].price).toBeCloseTo(200);
    expect(index[2].price).toBeCloseTo(210);
  });
  it("starts the holdings trend only when every held asset has a recorded quote", () => {
    const series = buildPortfolioQuoteSeries({ holdings: [
      { artist: earlier, shares: 1 }, { artist: later, shares: 1 }
    ] as never, shortPositions: [], cashBalance: 50 });
    expect(series).toEqual([{ date: "2026-10-02", price: 170 }, { date: "2026-10-03", price: 180 }]);
  });
  it("a new listing alone cannot cause a market-index jump", () => {
    const flat = { ...earlier, priceHistory: earlier.priceHistory.map(point => ({ ...point, price: 10 })) };
    expect(buildMarketIndexSeries([flat, { ...later, priceHistory: [later.priceHistory[0]] }]).map(point => point.price)).toEqual([100, 100, 100]);
  });
});
