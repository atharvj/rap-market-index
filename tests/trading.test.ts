import { describe, expect, it } from "vitest";
import {
  STARTING_CASH,
  clampTradeShareInput,
  estimateMarketMakerQuote,
  getDailyArtistBuyLimit,
  getMaximumBuyShares,
  getRemainingDailyArtistBuyValue,
  roundShareQuantityDown
} from "@/lib/trading";

describe("market-maker trading economics", () => {
  it("uses a focused opening bankroll", () => {
    expect(STARTING_CASH).toBe(25_000);
  });

  it("does not let the maximum one-order quote lift overcome round-trip costs", () => {
    const scenarios = [
      { midPrice: 5, shares: 100, volatility: 0.7 },
      { midPrice: 20, shares: 100, volatility: 1 },
      { midPrice: 50, shares: 100, volatility: 1.5 },
      { midPrice: 100, shares: 200, volatility: 2 }
    ];

    for (const scenario of scenarios) {
      const buy = estimateMarketMakerQuote({
        side: "buy",
        ...scenario
      });
      const sellAfterMaximumPerOrderLift = estimateMarketMakerQuote({
        side: "sell",
        midPrice: scenario.midPrice * 1.006,
        shares: scenario.shares,
        volatility: scenario.volatility
      });

      expect(sellAfterMaximumPerOrderLift.netProceeds).toBeLessThan(buy.totalCost);
    }
  });

  it("calculates a buy maximum that includes execution price and commission", () => {
    const maxShares = getMaximumBuyShares({
      cashBalance: 1_000,
      remainingPositionValue: 10_000,
      midPrice: 25,
      volatility: 1.2
    });
    const quote = estimateMarketMakerQuote({
      side: "buy",
      midPrice: 25,
      shares: maxShares,
      volatility: 1.2
    });
    const oversizedQuote = estimateMarketMakerQuote({
      side: "buy",
      midPrice: 25,
      shares: maxShares + 1,
      volatility: 1.2
    });

    expect(quote.totalCost).toBeLessThanOrEqual(1_000);
    expect(oversizedQuote.totalCost).toBeGreaterThan(1_000);
  });

  it("caps a buy at the remaining per-artist position room", () => {
    const maxShares = getMaximumBuyShares({
      cashBalance: 100_000,
      remainingPositionValue: 250,
      midPrice: 20,
      volatility: 1
    });
    const quote = estimateMarketMakerQuote({
      side: "buy",
      midPrice: 20,
      shares: maxShares,
      volatility: 1
    });

    expect(quote.orderValue).toBeLessThanOrEqual(250);
    expect(
      estimateMarketMakerQuote({
        side: "buy",
        midPrice: 20,
        shares: maxShares + 1,
        volatility: 1
      }).orderValue
    ).toBeGreaterThan(250);
  });

  it("caps a buy at the remaining rolling 24-hour artist allowance", () => {
    const maxShares = getMaximumBuyShares({
      cashBalance: 25_000,
      remainingPositionValue: 6_250,
      remainingDailyBuyValue: 2_000,
      midPrice: 47.54,
      volatility: 1.6
    });
    const quote = estimateMarketMakerQuote({
      side: "buy",
      midPrice: 47.54,
      shares: maxShares,
      volatility: 1.6
    });
    const oversizedQuote = estimateMarketMakerQuote({
      side: "buy",
      midPrice: 47.54,
      shares: maxShares + 1,
      volatility: 1.6
    });

    expect(quote.orderValue).toBeLessThanOrEqual(2_000);
    expect(oversizedQuote.orderValue).toBeGreaterThan(2_000);
    expect(getMaximumBuyShares({
      cashBalance: 25_000,
      remainingPositionValue: 6_250,
      remainingDailyBuyValue: 5_000,
      midPrice: 47.54,
      volatility: 1.6
    })).toBe(104);
  });

  it("shows a whole-share maximum that reconciles with a 24-hour dollar cap", () => {
    const maxShares = getMaximumBuyShares({
      cashBalance: 25_000,
      remainingPositionValue: 10_000,
      remainingDailyBuyValue: 1_349,
      midPrice: 134.89,
      volatility: 1
    });
    const maxQuote = estimateMarketMakerQuote({
      side: "buy",
      midPrice: 134.89,
      shares: maxShares,
      volatility: 1
    });
    const nextQuote = estimateMarketMakerQuote({
      side: "buy",
      midPrice: 134.89,
      shares: maxShares + 1,
      volatility: 1
    });

    expect(maxShares).toBe(9);
    expect(maxQuote.orderValue).toBeLessThanOrEqual(1_349);
    expect(nextQuote.orderValue).toBeGreaterThan(1_349);
  });

  it("matches the database daily allowance and subtracts only recent buys for that artist", () => {
    const now = Date.parse("2026-07-31T18:00:00Z");

    expect(getDailyArtistBuyLimit(1_000)).toBe(1_000);
    expect(getDailyArtistBuyLimit(5_000)).toBe(2_000);
    expect(getDailyArtistBuyLimit(25_000)).toBe(5_000);
    expect(getRemainingDailyArtistBuyValue({
      artistId: "nemzzz",
      portfolioValue: 25_000,
      now,
      transactions: [
        { artistId: "nemzzz", type: "buy", shares: 20, price: 50, grossValue: 1_000, createdAt: "2026-07-31T12:00:00Z" },
        { artistId: "nemzzz", type: "sell", shares: 10, price: 50, grossValue: 500, createdAt: "2026-07-31T13:00:00Z" },
        { artistId: "cardi-b", type: "buy", shares: 10, price: 100, grossValue: 1_000, createdAt: "2026-07-31T14:00:00Z" },
        { artistId: "nemzzz", type: "buy", shares: 10, price: 50, grossValue: 500, createdAt: "2026-07-30T12:00:00Z" }
      ]
    })).toBe(4_000);
  });

  it("rounds share caps down to whole shares without exceeding the available quantity", () => {
    expect(roundShareQuantityDown(10.1234569)).toBe(10);
    expect(roundShareQuantityDown(-1)).toBe(0);
  });

  it("clamps typed share quantities to the available maximum", () => {
    expect(clampTradeShareInput("11", 10)).toBe("10");
    expect(clampTradeShareInput("7.5", 10)).toBe("7");
    expect(clampTradeShareInput("", 10)).toBe("");
  });
});
