import { describe, expect, it } from "vitest";
import { collectListenBrainzMarketSignals } from "@/server/market/listenbrainz-source";
import type { MarketUpdateArtist } from "@/server/market/daily-update";

const artist: MarketUpdateArtist = {
  id: "artist",
  name: "Artist",
  ticker: "ARTIST",
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

const mbid = "f82bcf78-5b69-4622-a5ef-73800768d9ac";

describe("ListenBrainz market source", () => {
  it("collects exact-MBID popularity in one request and waits for a baseline before moving", async () => {
    let requestBody: unknown;
    const result = await collectListenBrainzMarketSignals({
      artists: [artist],
      runDate: "2026-07-11",
      externalIds: { [artist.id]: { artistId: artist.id, musicbrainzId: mbid } },
      fetchImpl: async (_input, init) => {
        requestBody = JSON.parse(String(init?.body));
        return new Response(JSON.stringify([{
          artist_mbid: mbid,
          total_listen_count: 100000,
          total_user_count: 5000
        }]), { status: 200 });
      }
    });

    expect(requestBody).toEqual({ artist_mbids: [mbid] });
    expect(result.observations).toHaveLength(2);
    expect(result.signals[artist.id].stats.streamingGrowth).toBeUndefined();
    expect(result.signals[artist.id].rawPayload.status).toBe("baseline_only");
  });

  it("uses later count growth only as a low-authority streaming confirmation", async () => {
    const result = await collectListenBrainzMarketSignals({
      artists: [artist],
      runDate: "2026-07-11",
      externalIds: { [artist.id]: { artistId: artist.id, musicbrainzId: mbid } },
      baselines: {
        [artist.id]: {
          listen_count: 90000,
          listener_count: 4800,
          listen_count__age_days: 1,
          listener_count__age_days: 1
        }
      },
      fetchImpl: async () => new Response(JSON.stringify([{
        artist_mbid: mbid,
        total_listen_count: 100000,
        total_user_count: 5000
      }]), { status: 200 })
    });

    expect(result.signals[artist.id].stats.streamingGrowth).toBeGreaterThan(0);
    expect(result.signals[artist.id].confidence).toBeLessThanOrEqual(0.62);
  });
});
