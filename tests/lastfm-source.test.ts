import { describe, expect, it } from "vitest";
import { collectLastfmMarketSignals } from "@/server/market/lastfm-source";
import type { MarketUpdateArtist } from "@/server/market/daily-update";

function artist(name: string, ticker: string): MarketUpdateArtist {
  return {
    id: ticker.toLowerCase(),
    name,
    ticker,
    currentPrice: 50,
    previousClose: 50,
    hypeScore: 50,
    volatility: 1,
    category: "mainstream",
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

describe("Last.fm identity fallback", () => {
  it("falls back from a failed MusicBrainz lookup to a safe artist-name match", async () => {
    const jayZ = artist("Jay-Z", "JAYZ");
    let requestCount = 0;
    const result = await collectLastfmMarketSignals({
      artists: [jayZ],
      runDate: "2026-07-11",
      apiKey: "test-key",
      externalIds: {
        [jayZ.id]: { artistId: jayZ.id, musicbrainzId: "f82bcf78-5b69-4622-a5ef-73800768d9ac" }
      },
      delayMs: 0,
      fetchImpl: async () => {
        requestCount += 1;
        return requestCount === 1
          ? new Response(JSON.stringify({ error: 6, message: "Artist not found" }), { status: 200 })
          : new Response(JSON.stringify({
              artist: {
                name: "JAY-Z",
                url: "https://www.last.fm/music/JAY-Z",
                stats: { listeners: "5500000", playcount: "880000000" }
              }
            }), { status: 200 });
      }
    });

    expect(requestCount).toBe(2);
    expect(result.observations.some((observation) => observation.metric === "listeners")).toBe(true);
    expect(result.signals[jayZ.id].rawPayload.matchedBy).toBe("name_search");
  });

  it("does not accept an unrelated autocorrect result for an ambiguous short name", async () => {
    const ye = artist("Ye", "YE");
    let requestCount = 0;
    const result = await collectLastfmMarketSignals({
      artists: [ye],
      runDate: "2026-07-11",
      apiKey: "test-key",
      externalIds: {
        [ye.id]: { artistId: ye.id, musicbrainzId: "164f0d73-1234-4e2c-8743-d77bf2191051" }
      },
      delayMs: 0,
      fetchImpl: async () => {
        requestCount += 1;
        return requestCount === 1
          ? new Response(JSON.stringify({ error: 6, message: "Artist not found" }), { status: 200 })
          : new Response(JSON.stringify({
              artist: {
                name: "Yes",
                stats: { listeners: "2000000", playcount: "200000000" }
              }
            }), { status: 200 });
      }
    });

    expect(result.observations.filter((observation) => observation.metric !== "request_error")).toHaveLength(0);
    expect(result.signals[ye.id].rawPayload.status).toBe("name_mismatch");
  });
});
