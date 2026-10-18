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
  it("checks the returned ID and safely falls back instead of trusting the fact that an ID was requested", async () => {
    const performer = artist("Artist", "ARTIST"); let calls = 0;
    const result = await collectLastfmMarketSignals({ artists: [performer], runDate: "2026-10-18", apiKey: "test", delayMs: 0,
      externalIds: { artist: { artistId: "artist", musicbrainzId: "expected-id" } }, fetchImpl: async () => {
        calls++; return Response.json({ artist: { name: calls === 1 ? "Wrong Artist" : "Artist", mbid: calls === 1 ? "wrong-id" : "",
          stats: { listeners: calls === 1 ? "99999999" : "12345", playcount: "100000" } } });
      } });
    expect(calls).toBe(2); expect(result.observations.find(row => row.metric === "listeners")?.value).toBe(12345);
    expect(result.signals.artist.rawPayload.musicbrainzIdVerified).toBe(false);
  });
  it("rejects a similarly named catalogue instead of accepting a loose contains match", async () => {
    const performer = artist("Drake", "DRAKE");
    const result = await collectLastfmMarketSignals({ artists: [performer], runDate: "2026-10-18", apiKey: "test", delayMs: 0,
      fetchImpl: async () => Response.json({ artist: { name: "Drake Bell", stats: { listeners: "500000", playcount: "1000000" } } }) });
    expect(result.observations).toHaveLength(0); expect(result.signals.drake.rawPayload.status).toBe("name_mismatch");
  });
  it("uses the provider's canonical catalogue when a renamed artist's external ID fails", async () => {
    const ye = artist("Ye", "YE");
    const result = await collectLastfmMarketSignals({
      artists: [ye], runDate: "2026-09-12", apiKey: "test-key", delayMs: 0,
      externalIds: { ye: { artistId: "ye", musicbrainzId: "missing-id", lastfmName: "Ye" } },
      fetchImpl: async input => {
        const url = new URL(String(input));
        if (url.searchParams.has("mbid")) return Response.json({ error: 6 });
        expect(url.searchParams.get("artist")).toBe("Kanye West");
        return Response.json({ artist: { name: "Kanye West", stats: { listeners: "8000000", playcount: "1600000000" } } });
      }
    });
    expect(result.signals.ye.rawPayload.status).not.toBe("name_mismatch");
    expect(result.observations.find(o => o.metric === "listeners")?.value).toBe(8_000_000);
  });
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

describe("Last.fm listening velocity", () => {
  it("treats slower-than-usual play growth as negative even while total plays rise", async () => {
    const performer = artist("Artist", "ARTIST");
    const result = await collectLastfmMarketSignals({
      artists: [performer],
      runDate: "2026-07-30",
      apiKey: "test-key",
      externalIds: {
        [performer.id]: {
          artistId: performer.id,
          musicbrainzId: "164f0d73-1234-4e2c-8743-d77bf2191051"
        }
      },
      baselines: {
        [performer.id]: {
          listeners: 1_000_000,
          listeners__age_days: 1,
          playcount: 100_000_000,
          playcount__age_days: 1,
          playcount__recent_daily_rate: 100_000,
          playcount__recent_rate_samples: 5
        }
      },
      delayMs: 0,
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            artist: {
              name: "Artist",
              stats: {
                listeners: "1000000",
                playcount: "100050000"
              }
            }
          }),
          { status: 200 }
        )
    });
    const signal = result.signals[performer.id];

    expect(signal.stats.streamingGrowth).toBeLessThan(0);
    expect(signal.stats.socialGrowth).toBeUndefined();
    expect(signal.rawPayload.playcountRateMomentum).toBeLessThan(0);
    expect(signal.rawPayload.velocityMinimumTickEligible).toBe(true);
  });

  it("uses completed daily velocity when a recent refresh consumed the live counter change", async () => {
    const performer = artist("Artist", "ARTIST");
    const result = await collectLastfmMarketSignals({
      artists: [performer],
      runDate: "2026-07-30",
      apiKey: "test-key",
      externalIds: {
        [performer.id]: {
          artistId: performer.id,
          musicbrainzId: "164f0d73-1234-4e2c-8743-d77bf2191051"
        }
      },
      baselines: {
        [performer.id]: {
          listeners: 1_000_000,
          listeners__observed_at_ms: Date.now() - 2 * 60 * 60 * 1000,
          playcount: 100_000_000,
          playcount__observed_at_ms: Date.now() - 2 * 60 * 60 * 1000,
          playcount__recent_daily_rate: 100_000,
          playcount__recent_rate_samples: 4,
          playcount__latest_completed_daily_rate: 70_000
        }
      },
      useCompletedIntervalFallback: true,
      delayMs: 0,
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            artist: {
              name: "Artist",
              stats: {
                listeners: "1000000",
                playcount: "100000000"
              }
            }
          }),
          { status: 200 }
        )
    });
    const signal = result.signals[performer.id];
    const quality = signal.rawPayload.playcountRateMomentumQuality as {
      rateObservationSource: string;
      currentDailyRate: number;
    };

    expect(signal.stats.streamingGrowth).toBeUndefined();
    expect(quality.rateObservationSource).toBeNull();
  });
});
