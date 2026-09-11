import { describe, expect, it, vi } from "vitest";
import { collectSpotifyPublicSignals, parseSpotifyMonthlyListeners } from "@/server/market/spotify-public-source";
import type { MarketUpdateArtist } from "@/server/market/daily-update";

const id = "3YQEnGNd8ooVyyhjnuwQIm";
const page = (name = "Example", count = "821,786") => `<meta content="${name}" property="og:title"><meta property="og:url" content="https://open.spotify.com/artist/${id}"><div data-testid="monthly-listeners-label">${count} monthly listeners</div>`;
const artist: MarketUpdateArtist = { id: "example", name: "Example", ticker: "TEST", currentPrice: 20, previousClose: 20, category: "rising", hypeScore: 50, volatility: 1, stats: { streamingGrowth: 0, youtubeGrowth: 0, searchGrowth: 0, socialGrowth: 0, newsScore: 50, traderDemand: 0 } };

describe("verified public Spotify audience", () => {
  it("reads exact displayed counts and verifies the canonical ID and name", () => {
    expect(parseSpotifyMonthlyListeners(page(), id, ["Example"])?.monthlyListeners).toBe(821786);
    expect(parseSpotifyMonthlyListeners(page("Artist's Name"), id, ["Artist's Name"])?.name).toBe("Artist's Name");
    expect(parseSpotifyMonthlyListeners(page(), "0".repeat(22), ["Example"])).toBeNull();
    expect(parseSpotifyMonthlyListeners(page("Other Artist"), id, ["Example"])).toBeNull();
  });

  it.each(["821.8K", "0", "-123", "8,21,786", "1000000001"])("rejects unavailable, approximate, or invalid count %s", count => {
    expect(parseSpotifyMonthlyListeners(page("Example", count), id, ["Example"])).toBeNull();
  });

  it("records the first real observation without inventing growth", async () => {
    const fetchImpl = vi.fn(async () => new Response(page()));
    const result = await collectSpotifyPublicSignals({ artists: [artist], runDate: "2026-09-05", externalIds: { example: { artistId: "example", spotifyId: id } }, delayMs: 0, fetchImpl });
    expect(result.observations[0]).toMatchObject({ source: "spotify_public", metric: "monthly_listeners", value: 821786 });
    expect(result.signals.example.stats).toEqual({});
    expect(result.signals.example.rawPayload.status).toBe("baseline_only");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("stops the batch at a provider rate limit and never saves zeros", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 429 }));
    const result = await collectSpotifyPublicSignals({ artists: [artist, { ...artist, id: "second" }], runDate: "2026-09-05", externalIds: { example: { artistId: "example", spotifyId: id }, second: { artistId: "second", spotifyId: id } }, delayMs: 0, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.observations).toEqual([]);
    expect(result.warnings[0]).toContain("429");
  });
});
