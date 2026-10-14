import { describe, expect, it } from "vitest";
import { collectBlueskyMarketSignals } from "@/server/market/bluesky-source";
import type { MarketUpdateArtist } from "@/server/market/daily-update";

const artist: MarketUpdateArtist = {
  id: "lil-tecca",
  name: "Lil Tecca",
  ticker: "TECCA",
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

describe("Bluesky market source", () => {
  it.each(["Lil Tecca new album is bad and boring", "Lil Tecca performance was bad with an empty crowd", "Lil Tecca new album isn't fire", "Lil Tecca new album: I don't like it", "crazy how Lil Tecca new album is trash"])("does not classify criticism as release/performance hype: %s", async text => {
    const result = await collectBlueskyMarketSignals({ artists: [artist], runDate: "2026-08-10", delayMs: 0,
      fetchImpl: async () => Response.json({ posts: [{ uri: "at://did:plc:fan/app.bsky.feed.post/negative", author: { handle: "fan.bsky.social" },
        record: { text, createdAt: "2026-08-10T12:00:00Z" }, likeCount: 150 }] }) });
    expect(result.signals[artist.id].stats.socialGrowth).toBeLessThan(0);
    expect(result.eventsByArtist[artist.id]?.[0].impactScore).toBeLessThan(0);
    expect(result.eventsByArtist[artist.id]?.[0].sentimentScore).toBeLessThan(0);
  });
  it("does not turn widely shared criticism into approval or search growth", async () => {
    const result = await collectBlueskyMarketSignals({ artists: [artist], runDate: "2026-08-10", delayMs: 0,
      baselines: { [artist.id]: { post_count: 1, engagement_score: 1, negative_post_count: 1 } },
      fetchImpl: async () => Response.json({ posts: Array.from({ length: 15 }, (_, i) => ({
        uri: `at://did:plc:fan${i}/app.bsky.feed.post/negative`, author: { handle: `fan${i}.bsky.social` },
        record: { text: "Lil Tecca album review: this album is trash, boring and disappointing", createdAt: "2026-08-10T12:00:00Z" }, likeCount: 500
      })) }) });
    expect(result.signals[artist.id].stats.socialGrowth).toBeLessThan(0);
    expect(result.signals[artist.id].stats.searchGrowth).toBeUndefined();
  });
  it("limits repeated posts by one author and reduces confidence in tiny samples", async () => {
    const result = await collectBlueskyMarketSignals({ artists: [artist], runDate: "2026-08-10", delayMs: 0,
      fetchImpl: async () => Response.json({ posts: Array.from({ length: 20 }, (_, i) => ({
        uri: `at://did:plc:one/app.bsky.feed.post/post${i}`, author: { handle: "one.bsky.social" },
        record: { text: "Lil Tecca new album is fire", createdAt: "2026-08-10T12:00:00Z" }, likeCount: 1
      })) }) });
    expect(result.signals[artist.id].rawPayload.postCount).toBe(2);
    expect(result.signals[artist.id].confidence).toBeLessThan(0.25);
  });
  it.each([{}, { posts: null }, { error: "Unavailable" }])("does not treat malformed success responses as no discussion: %j", async payload => {
    const result = await collectBlueskyMarketSignals({ artists: [artist], runDate: "2026-08-10", delayMs: 0,
      fetchImpl: async () => Response.json(payload) });
    expect(result.signals[artist.id].stats).toEqual({});
    expect(result.observations.some(o => o.metric === "post_count")).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
  it("disambiguates short artist names without excluding adjacent public attention", async () => {
    let requestedQuery = "";
    await collectBlueskyMarketSignals({
      artists: [{ ...artist, id: "drake", name: "Drake", ticker: "DRAKE" }],
      runDate: "2026-08-10",
      delayMs: 0,
      fetchImpl: async (input) => {
        requestedQuery = new URL(String(input)).searchParams.get("q") ?? "";
        return new Response(JSON.stringify({ posts: [] }), { status: 200 });
      }
    });

    expect(requestedQuery).toContain('"Drake"');
    expect(requestedQuery).toBe('"Drake" rapper');
  });

  it("collects a music-specific social catalyst without credentials", async () => {
    const result = await collectBlueskyMarketSignals({
      artists: [artist],
      runDate: "2026-07-30",
      delayMs: 0,
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            posts: [
              {
                uri: "at://did:plc:musicfan/app.bsky.feed.post/3abc123",
                author: { handle: "musicfan.bsky.social", displayName: "Music Fan" },
                record: {
                  text: "Lil Tecca announces a new album dropping Friday. The snippet sounds incredible.",
                  createdAt: "2026-07-30T12:00:00.000Z"
                },
                likeCount: 120,
                repostCount: 35,
                replyCount: 18,
                quoteCount: 9
              }
            ]
          }),
          { status: 200 }
        )
    });

    expect(result.warnings).toEqual([]);
    expect(result.observations.some((observation) => observation.metric === "post_count")).toBe(true);
    expect(result.signals[artist.id].stats.socialGrowth).toBeGreaterThan(0);
    expect(result.signals[artist.id].stats.newsScore).toBeUndefined();
    expect(result.eventsByArtist[artist.id]?.[0]).toMatchObject({
      artistId: artist.id,
      eventType: "release",
      sourceName: "Bluesky"
    });
  });

  it("treats mocked livestream coverage as negative fan response, not a positive performance", async () => {
    const drake = { ...artist, id: "drake", name: "Drake", ticker: "DRAKE" };
    const result = await collectBlueskyMarketSignals({
      artists: [drake],
      runDate: "2026-08-10",
      delayMs: 0,
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            posts: [
              {
                uri: "at://did:plc:publisher/app.bsky.feed.post/mock-stream",
                author: { handle: "publisher.bsky.social", displayName: "Publisher" },
                record: {
                  text: "Drake was mocked and ridiculed by fans after a viral livestream clip.",
                  createdAt: "2026-08-10T12:00:00.000Z"
                },
                likeCount: 40,
                repostCount: 8,
                replyCount: 12,
                quoteCount: 4
              }
            ]
          }),
          { status: 200 }
        )
    });

    expect(result.signals[drake.id].rawPayload).toMatchObject({
      negativePostCount: 1,
      hypePostCount: 1
    });
    expect(result.signals[drake.id].stats.socialGrowth).toBeLessThan(0);
    expect(result.eventsByArtist[drake.id]?.[0]).toMatchObject({
      eventType: "controversy",
      sentimentScore: expect.any(Number),
      rawPayload: { classificationReason: "backlash_terms" }
    });
    expect(result.eventsByArtist[drake.id]?.[0].sentimentScore).toBeLessThan(0);
  });

  it("drops a partial prefix when most roster searches fail", async () => {
    const artists = Array.from({ length: 12 }, (_, index) => ({
      ...artist,
      id: `artist-${index}`,
      name: `Artist ${index}`,
      ticker: `ART${index}`
    }));
    let requestCount = 0;
    const result = await collectBlueskyMarketSignals({
      artists,
      runDate: "2026-08-02",
      delayMs: 0,
      fetchImpl: async () => {
        requestCount += 1;

        return requestCount <= 3
          ? new Response(JSON.stringify({ posts: [] }), { status: 200 })
          : new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
      }
    });

    expect(result.signals).toEqual({});
    expect(result.eventsByArtist).toEqual({});
    expect(result.observations).toHaveLength(9);
    expect(result.observations.every((observation) => observation.metric === "request_error")).toBe(true);
    expect(result.warnings).toEqual([
      "Bluesky was excluded from pricing because 9 of 12 artist searches failed."
    ]);
  });
});
