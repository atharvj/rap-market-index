import { describe, expect, it } from "vitest";
import { adjustPriceHistory, originalPriceHistory } from "@/lib/adjusted-price-history";
import { getShortingReadiness } from "@/lib/shorting-readiness";
import { buildMarketIndexSeries, buildPortfolioQuoteSeries } from "@/lib/market-analytics";
import { createInitialGameState } from "@/lib/market";

describe("comparable chart history", () => {
  it.each([3, 0.5])("preserves every date, original quote, and historical return with factor %s", factor => {
    const points = [10, 10.1, 9.9, 10, 10 * factor, 10.1 * factor].map((price, index) => ({
      date: `2026-09-0${index + 1}`, price
    }));
    const original = structuredClone(points);
    const adjustments = [{ effectiveDate: "2026-09-05", factor }];
    const adjusted = adjustPriceHistory(points, adjustments);
    expect(points).toEqual(original);
    expect(adjusted.map(point => point.date)).toEqual(points.map(point => point.date));
    expect(originalPriceHistory(adjusted)).toEqual(original);
    expect(adjustPriceHistory(adjusted, adjustments)).toEqual(adjusted);
    expect(adjusted.slice(4)).toEqual(original.slice(4));
    for (let i = 1; i < 4; i++) expect(adjusted[i].price / adjusted[i - 1].price).toBeCloseTo(points[i].price / points[i - 1].price, 12);
    expect(adjusted[4].price).toBe(adjusted[3].price);
  });

  it("composes corrections without changing later quotes", () => {
    const original = [{ date: "2026-09-01", price: 10 }, { date: "2026-09-03", price: 20 }, { date: "2026-09-05", price: 30 }];
    const adjusted = adjustPriceHistory(original, [{ effectiveDate: "2026-09-03", factor: 2 }, { effectiveDate: "2026-09-05", factor: 1.5 }]);
    expect(adjusted.map(point => point.price)).toEqual([30, 30, 30]);
    expect(originalPriceHistory(adjusted)).toEqual(original);
  });

  it("uses the actual intraday correction time, including after UTC midnight", () => {
    const points = [
      { date: "2026-09-10T20:00:00Z", price: 10 },
      { date: "2026-09-11T02:00:00Z", price: 10.1 },
      { date: "2026-09-11T03:14:54.184952Z", price: 30.3 },
      { date: "2026-09-11T08:00:00Z", price: 30.6 }
    ];
    const adjusted = adjustPriceHistory(points, [{ effectiveDate: "2026-09-10", effectiveAt: points[2].date, factor: 3 }], "intraday");
    expect(adjusted.map(point => point.price)).toEqual([30, 30.299999999999997, 30.3, 30.6]);
    expect(originalPriceHistory(adjusted)).toEqual(points);
    expect(adjustPriceHistory(points, [{ effectiveDate: "2026-09-10", factor: 3 }], "intraday")).toEqual(points);
  });

  it("does not change trading eligibility or current portfolio values", () => {
    const points = Array.from({ length: 32 }, (_, index) => ({ date: new Date(Date.UTC(2026, 7, index + 1)).toISOString().slice(0, 10), price: index === 31 ? 30 : 10 + index / 100 }));
    const adjusted = adjustPriceHistory(points, [{ effectiveDate: points[31].date, factor: 3 }]);
    expect(getShortingReadiness(adjusted)).toEqual(getShortingReadiness(points));
    const artist = { ...createInitialGameState().artists[0], currentPrice: 30, priceHistory: adjusted };
    const index = buildMarketIndexSeries([artist], 32);
    expect(index[31].price).toBe(100);
    const holding = { artistId: artist.id, artist, shares: 2, averageBuyPrice: 10, currentValue: 60, costBasis: 20, profitLoss: 40, profitLossPercent: 200, dayChange: 0 };
    const portfolio = buildPortfolioQuoteSeries({ holdings: [holding], shortPositions: [], cashBalance: 100, maxPoints: 32 });
    expect(portfolio[0].price).toBe(160);
    expect(portfolio[31].price).toBe(160);
    expect(artist.currentPrice).toBe(30);
  });
});
