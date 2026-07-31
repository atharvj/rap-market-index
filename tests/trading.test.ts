import { describe, expect, it } from "vitest";
import {
  STARTING_CASH,
  clampTradeShareInput,
  estimateMarketMakerQuote,
  getMaximumBuyShares,
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
      shares: maxShares + 0.01,
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
        shares: maxShares + 0.01,
        volatility: 1
      }).orderValue
    ).toBeGreaterThan(250);
  });

  it("rounds share caps down without exceeding the available quantity", () => {
    expect(roundShareQuantityDown(10.1234569)).toBe(10.123456);
    expect(roundShareQuantityDown(-1)).toBe(0);
  });

  it("clamps typed share quantities to the available maximum", () => {
    expect(clampTradeShareInput("11", 10)).toBe("10");
    expect(clampTradeShareInput("7.5", 10)).toBe("7.5");
    expect(clampTradeShareInput("", 10)).toBe("");
  });
});
