import { describe, expect, it } from "vitest";
import { collectPolymarketMarketSignals } from "@/server/market/polymarket-source";
import type { MarketUpdateArtist } from "@/server/market/daily-update";

function createArtist(id: string, name: string): MarketUpdateArtist {
  return {
    id,
    name,
    ticker: name.toUpperCase(),
    currentPrice: 20,
    previousClose: 20,
    hypeScore: 50,
    volatility: 1,
    category: "rising",
    stats: {
      streamingGrowth: 0,
      youtubeGrowth: 0,
      searchGrowth: 0,
      socialGrowth: 0,
      newsScore: 50,
      traderDemand: 0
    }
  };
}

function searchResponse(events: unknown[]) {
  return new Response(JSON.stringify({ events, pagination: { hasMore: false } }), { status: 200 });
}

function musicMarket(overrides: Record<string, unknown> = {}) {
  return {
    id: "market-1",
    question: "Will Drake release a new album in 2026?",
    groupItemTitle: "Drake",
    outcomes: "[\"Yes\", \"No\"]",
    outcomePrices: "[\"0.62\", \"0.38\"]",
    bestBid: 0.61,
    bestAsk: 0.63,
    lastTradePrice: 0.62,
    liquidity: "12000",
    volume: "180000",
    volume24hr: 8000,
    oneDayPriceChange: 0.05,
    active: true,
    closed: false,
    acceptingOrders: true,
    ...overrides
  };
}

describe("Polymarket market source", () => {
  it("uses liquid music probability movement as a capped confirmation signal", async () => {
    const result = await collectPolymarketMarketSignals({
      artists: [createArtist("drake", "Drake")],
      runDate: "2026-07-25",
      searchQueries: ["album"],
      fetchImpl: async () => searchResponse([{
        id: "event-1",
        title: "Which artists will release new albums in 2026?",
        slug: "artists-new-albums-2026",
        active: true,
        closed: false,
        markets: [musicMarket()]
      }])
    });

    expect(result.signals.drake.stats.traderDemand).toBe(6);
    expect(result.signals.drake.confidence).toBeLessThanOrEqual(0.44);
    expect(result.observations.some((row) => row.metric === "music_market_probability")).toBe(true);
    expect(result.observations.some((row) => row.metric === "music_market_probability_1d_change")).toBe(true);
    expect(result.signals.drake.rawPayload.status).toBe("momentum");
  });

  it("stores a liquid probability baseline but does not treat the odds level as a price vote", async () => {
    const result = await collectPolymarketMarketSignals({
      artists: [createArtist("carti", "Playboi Carti")],
      runDate: "2026-07-25",
      searchQueries: ["album"],
      fetchImpl: async () => searchResponse([{
        id: "event-2",
        title: "What will happen before GTA VI?",
        slug: "before-gta-vi",
        active: true,
        closed: false,
        markets: [musicMarket({
          id: "market-2",
          question: "New Playboi Carti Album before GTA VI?",
          groupItemTitle: "New Playboi Carti Album",
          outcomePrices: "[\"0.92\", \"0.08\"]",
          oneDayPriceChange: null
        })]
      }])
    });

    expect(result.signals.carti.stats).toEqual({});
    expect(result.signals.carti.rawPayload.status).toBe("baseline_only");
    expect(result.observations.find((row) => row.metric === "music_market_probability")?.value).toBe(92);
  });

  it("rejects non-music stories and thin or ambiguous contracts from pricing", async () => {
    const result = await collectPolymarketMarketSignals({
      artists: [
        createArtist("ice-spice", "Ice Spice"),
        createArtist("future", "Future"),
        createArtist("drake", "Drake")
      ],
      runDate: "2026-07-25",
      searchQueries: ["album"],
      fetchImpl: async () => searchResponse([
        {
          id: "event-fragrance",
          title: "Celebrity product launches",
          active: true,
          closed: false,
          markets: [musicMarket({
            id: "fragrance",
            question: "Will Ice Spice launch another fragrance?",
            groupItemTitle: "Ice Spice"
          })]
        },
        {
          id: "event-future",
          title: "The future of music streaming",
          active: true,
          closed: false,
          markets: [musicMarket({
            id: "future",
            question: "Will the future of music be streaming?",
            groupItemTitle: null
          })]
        },
        {
          id: "event-thin",
          title: "Which artists will release new albums in 2026?",
          active: true,
          closed: false,
          markets: [musicMarket({
            id: "thin",
            liquidity: "200",
            volume: "500",
            volume24hr: 10
          })]
        }
      ])
    });

    expect(result.signals["ice-spice"]).toBeUndefined();
    expect(result.signals.future).toBeUndefined();
    expect(result.signals.drake.stats).toEqual({});
    expect(result.signals.drake.rawPayload.status).toBe("baseline_only");
  });

  it("deduplicates the same event returned by several music searches", async () => {
    let requests = 0;
    const event = {
      id: "event-1",
      title: "Which artists will release new albums in 2026?",
      active: true,
      closed: false,
      markets: [musicMarket()]
    };
    const result = await collectPolymarketMarketSignals({
      artists: [createArtist("drake", "Drake")],
      runDate: "2026-07-25",
      searchQueries: ["album", "artist"],
      fetchImpl: async () => {
        requests += 1;
        return searchResponse([event]);
      }
    });

    expect(requests).toBe(2);
    expect(result.signals.drake.rawPayload.matchedContractCount).toBe(1);
  });
});
