import { describe, expect, it } from "vitest";
import { estimateMarketMakerQuote } from "@/lib/trading";

describe("market-maker trading economics", () => {
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
});
