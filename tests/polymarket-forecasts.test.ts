import { describe, expect, it } from "vitest";
import { buildPublicMarketForecasts } from "@/server/market/polymarket-forecasts";

describe("public Polymarket forecasts", () => {
  it("maps a qualified contract into a safe public forecast without an outbound market link", () => {
    const forecasts = buildPublicMarketForecasts({
      artistId: "lil-tecca",
      observedDate: "2026-07-26",
      rawPayload: {
        contracts: [{
          marketId: "tecca-1",
          eventTitle: "Lil Tecca next album",
          eventUrl: "https://polymarket.com/event/example",
          question: "Will Lil Tecca's next album go #1?",
          probability: 0.64,
          artistOutlookProbability: 0.64,
          oneDayPriceChange: 0.04,
          artistOutlookChange: 0.04,
          liquidity: 8000,
          volume: 75000,
          volume24hr: 4000,
          spread: 0.04,
          forecastKind: "chart",
          direction: "bullish_yes",
          importanceWeight: 0.92,
          qualityScore: 0.75,
          tracked: true,
          isNew: true,
          signalEligible: false,
          endDate: "2026-09-01T00:00:00Z"
        }]
      }
    });

    expect(forecasts).toHaveLength(1);
    expect(forecasts[0]).toMatchObject({
      artistId: "lil-tecca",
      probabilityPercent: 64,
      artistOutlookChangePoints: 4,
      kind: "chart",
      isNew: true,
      pricingEligible: false,
      marketQuality: "established"
    });
    expect(forecasts[0]).not.toHaveProperty("eventUrl");
  });

  it("filters contracts that do not clear the minimum public tracking quality", () => {
    const forecasts = buildPublicMarketForecasts({
      artistId: "artist",
      observedDate: "2026-07-26",
      rawPayload: {
        contracts: [{
          marketId: "thin",
          question: "Will Artist release an album?",
          probability: 0.5,
          liquidity: 10,
          volume: 40,
          spread: 0.8
        }]
      }
    });

    expect(forecasts).toEqual([]);
  });

  it("supports older stored payloads and interprets negative Yes outcomes from their wording", () => {
    const forecasts = buildPublicMarketForecasts({
      artistId: "artist",
      observedDate: "2026-07-26",
      rawPayload: {
        contracts: [{
          marketId: "negative",
          eventTitle: "Artist album timing",
          question: "Will Artist fail to release an album this year?",
          probability: 0.7,
          oneDayPriceChange: 0.05,
          liquidity: 3000,
          volume: 30000,
          spread: 0.08,
          signalEligible: true
        }]
      }
    });

    expect(forecasts[0]).toMatchObject({
      direction: "bearish_yes",
      artistOutlookPercent: 30,
      artistOutlookChangePoints: -5,
      kind: "release"
    });
  });
});
