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
  it("reduces confidence and seeds a new comparison when a contextual query fails", async () => {
    const thug = { ...artist, id: "young-thug", name: "Young Thug" };
    const posts = Array.from({ length: 4 }, (_, i) => ({ uri: `at://did:plc:fan${i}/app.bsky.feed.post/review`, author: { handle: `fan${i}.bsky.social` },
      record: { text: "Young Thug album is trash and boring", createdAt: "2026-10-13T12:00:00Z" }, likeCount: 10 }));
    const full = await collectBlueskyMarketSignals({ artists: [thug], runDate: "2026-10-14", delayMs: 0, fetchImpl: async () => Response.json({ posts }) });
    const baseline = Object.fromEntries(full.observations.map(o => [o.metric, o.value]));
    const partial = await collectBlueskyMarketSignals({ artists: [thug], runDate: "2026-10-14", delayMs: 0, baselines: { [thug.id]: baseline },
      fetchImpl: async input => new URL(String(input)).searchParams.get("q")?.includes("UY SCUTI") ? Response.json({ error: "Unavailable" }, { status: 503 }) : Response.json({ posts }) });
    expect(partial.signals[thug.id].confidence).toBeLessThan(full.signals[thug.id].confidence!);
    expect(partial.signals[thug.id].rawPayload.baselinePostCount).toBeNull();
    expect(partial.signals[thug.id].stats.socialGrowth).toBeLessThan(0);
    expect(partial.warnings.length).toBeGreaterThan(0);
  });
  it("finds criticism of a verified old album without pretending it was newly released", async () => {
    const thug = { ...artist, id: "young-thug", name: "Young Thug", ticker: "THUG" };
    const queries: string[] = [];
    const result = await collectBlueskyMarketSignals({ artists: [thug], runDate: "2026-10-14", delayMs: 0,
      fetchImpl: async input => {
        const query = new URL(String(input)).searchParams.get("q") ?? ""; queries.push(query);
        return Response.json({ posts: query.includes("UY SCUTI") ? Array.from({ length: 5 }, (_, i) => ({
          uri: `at://did:plc:fan${i}/app.bsky.feed.post/review`, author: { handle: `fan${i}.bsky.social` },
          record: { text: "UY SCUTI album is trash and disappointing", createdAt: "2026-10-13T12:00:00Z" }, likeCount: 20
        })) : [] });
      } });
    expect(queries).toContain('"UY SCUTI" album');
    expect(queries).toContain('"Slime Language 3" album');
    expect(result.signals[thug.id].stats.socialGrowth).toBeLessThan(0);
    expect(result.signals[thug.id].rawPayload.releaseMatchedPostCount).toBe(5);
    expect(result.eventsByArtist[thug.id]).toBeUndefined();
  });
  it("keeps neutral album announcements out of fan approval while retaining catalyst evidence", async () => {
    const result = await collectBlueskyMarketSignals({ artists: [artist], runDate: "2026-10-14", delayMs: 0,
      fetchImpl: async () => Response.json({ posts: [{ uri: "at://did:plc:label/app.bsky.feed.post/new", author: { handle: "label.bsky.social" },
        record: { text: "Lil Tecca announces a new album dropping Friday", createdAt: "2026-10-14T12:00:00Z" }, likeCount: 150 }] }) });
    expect(result.signals[artist.id].stats.socialGrowth).toBeUndefined();
    expect(result.signals[artist.id].rawPayload.classifiedReactionCount).toBe(0);
    expect(result.observations.some(o => o.metric === "reaction_sentiment")).toBe(false);
    expect(result.eventsByArtist[artist.id]?.[0].eventType).toBe("release");
  });
  it("does not count the same post multiple times across contextual searches", async () => {
    const result = await collectBlueskyMarketSignals({ artists: [{ ...artist, id: "young-thug", name: "Young Thug" }], runDate: "2026-10-14", delayMs: 0,
      fetchImpl: async () => Response.json({ posts: [{ uri: "at://did:plc:one/app.bsky.feed.post/one", author: { handle: "one.bsky.social" },
        record: { text: "Young Thug album is trash", createdAt: "2026-10-14T12:00:00Z" }, likeCount: 30 }] }) });
    expect(result.signals["young-thug"].rawPayload.postCount).toBe(1);
  });
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
    const requestedQueries: string[] = [];
    await collectBlueskyMarketSignals({
      artists: [{ ...artist, id: "drake", name: "Drake", ticker: "DRAKE" }],
      runDate: "2026-08-10",
      delayMs: 0,
      fetchImpl: async (input) => {
        requestedQueries.push(new URL(String(input)).searchParams.get("q") ?? "");
        return new Response(JSON.stringify({ posts: [] }), { status: 200 });
      }
    });

    expect(requestedQueries).toContain('"Drake" rapper');
    expect(requestedQueries.every(query => query.includes('"Drake"'))).toBe(true);
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

        return requestCount <= 6
          ? new Response(JSON.stringify({ posts: [] }), { status: 200 })
          : new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
      }
    });

    expect(result.signals).toEqual({});
    expect(result.eventsByArtist).toEqual({});
    expect(result.observations.filter(o => o.metric === "request_error")).toHaveLength(9);
    expect(result.observations.filter(o => o.metric === "reception_available")).toHaveLength(12);
    expect(result.observations.filter(o => o.metric === "reception_available").every(o => o.value === 0)).toBe(true);
    expect(result.warnings).toEqual([
      "Bluesky was excluded from pricing because 9 of 12 artist searches failed."
    ]);
  });
});

it("requires both latest and top search samples and deduplicates them", async () => {
  const sorts = new Set<string>();
  const fetchImpl: typeof fetch = async input => {
    sorts.add(new URL(String(input)).searchParams.get("sort")!);
    return Response.json({ posts: [{ uri: "at://did:plc:fan/app.bsky.feed.post/review", author: { handle: "fan.bsky.social" },
      record: { text: "Lil Tecca album 2/10", createdAt: "2026-10-14T12:00:00Z" }, likeCount: 80 }] });
  };
  const full = await collectBlueskyMarketSignals({ artists: [artist], runDate: "2026-10-14", delayMs: 0, fetchImpl });
  expect([...sorts].sort()).toEqual(["latest", "top"]);
  expect(full.signals[artist.id].rawPayload.postCount).toBe(1);
  expect(full.signals[artist.id].stats.socialGrowth).toBeLessThan(0);
  const partial = await collectBlueskyMarketSignals({ artists: [artist], runDate: "2026-10-14", delayMs: 0,
    fetchImpl: input => new URL(String(input)).searchParams.get("sort") === "top" ? Promise.resolve(new Response("Unavailable", { status: 503 })) : fetchImpl(input) });
  expect(partial.observations.some(o => o.metric === "reaction_sentiment")).toBe(false);
  expect(partial.signals[artist.id].stats).toEqual({});
});
it("does not turn copied long reviews into several independent fans", async () => {
  const result = await collectBlueskyMarketSignals({ artists: [artist], runDate: "2026-10-14", delayMs: 0,
    fetchImpl: async () => Response.json({ posts: Array.from({ length: 15 }, (_, i) => ({ uri: `at://did:plc:copy${i}/app.bsky.feed.post/review`, author: { handle: `copy${i}.bsky.social` },
      record: { text: "Lil Tecca album review: the production is boring and this album is disappointing", createdAt: "2026-10-14T12:00:00Z" }, likeCount: 0 })) }) });
  expect(result.signals[artist.id].rawPayload.postCount).toBe(1);
  expect(result.signals[artist.id].rawPayload.duplicateCopyCount).toBe(14);
  expect(result.signals[artist.id].stats).toEqual({});
});
it("assigns opposite reactions to their explicit artists and abstains on an ambiguous comparison", async () => {
  const thug = { ...artist, id: "young-thug", name: "Young Thug" }, drake = { ...artist, id: "drake", name: "Drake" };
  const collect = (text: string) => collectBlueskyMarketSignals({ artists: [thug, drake], runDate: "2026-10-14", delayMs: 0,
    fetchImpl: async () => Response.json({ posts: [{ uri: "at://did:plc:fan/app.bsky.feed.post/review", author: { handle: "fan.bsky.social" },
      record: { text, createdAt: "2026-10-14T12:00:00Z" }, likeCount: 100 }] }) });
  const result = await collect("Young Thug album was trash but Drake album is fire");
  expect(result.signals[thug.id].stats.socialGrowth).toBeLessThan(0);
  expect(result.signals[drake.id].stats.socialGrowth).toBeGreaterThan(0);
  const ambiguous = await collect("Young Thug album is better than Drake album");
  expect(ambiguous.signals[thug.id].stats).toEqual({});
  expect(ambiguous.signals[drake.id].stats).toEqual({});
});

it("keeps other artists' reactions separate even when refreshing a one-artist batch", async () => {
  const thug = { ...artist, id: "young-thug", name: "Young Thug" };
  const result = await collectBlueskyMarketSignals({ artists: [thug], runDate: "2026-10-14", delayMs: 0,
    fetchImpl: async () => Response.json({ posts: [{ uri: "at://did:plc:fan/app.bsky.feed.post/review", author: { handle: "fan.bsky.social" },
      record: { text: "Young Thug album was trash but Drake album is fire", createdAt: "2026-10-14T12:00:00Z" }, likeCount: 100 }] }) });
  expect(result.signals[thug.id].stats.socialGrowth).toBeLessThan(0);
});

it("does not treat a quoted search term or a partial compact name as an artist identity", async () => {
  const result = await collectBlueskyMarketSignals({ artists: [artist], runDate: "2026-10-14", delayMs: 0,
    externalIds: { [artist.id]: { artistId: artist.id, gdeltQuery: '"Lil Tecca" OR "another performer"' } },
    fetchImpl: async () => Response.json({ posts: ["another performer album is fire", "Lil Teccalicious album is fire"].map((text, i) => ({
      uri: `at://did:plc:fan${i}/app.bsky.feed.post/review`, author: { handle: `fan${i}.bsky.social` },
      record: { text, createdAt: "2026-10-14T12:00:00Z" }, likeCount: 100 })) }) });
  expect(result.signals[artist.id].rawPayload.postCount).toBe(0);
  expect(result.signals[artist.id].stats).toEqual({});
});

it.each([
  ["Kanye West BULLY concert last night was fire", true],
  ["Kanye West BULLY album is fire", false],
  ["Rewatched old footage of Kanye West BULLY concert last night, fire", false]
])("keeps current shows distinct from old album discussion: %s", async (text, shouldHaveEvent) => {
  const ye = { ...artist, id: "ye", name: "Ye" };
  const result = await collectBlueskyMarketSignals({ artists: [ye], runDate: "2026-10-15", delayMs: 0,
    fetchImpl: async () => Response.json({ posts: [{ uri: "at://did:plc:fan/app.bsky.feed.post/show", author: { handle: "fan.bsky.social" },
      record: { text, createdAt: "2026-10-15T01:00:00Z" }, likeCount: 200 }] }) });
  expect(Boolean(result.eventsByArtist[ye.id]?.length)).toBe(shouldHaveEvent);
});

it("excludes future timestamps even when they fall on the current calendar date", async () => {
  const createdAt = new Date(Date.now() + 3600000).toISOString();
  const result = await collectBlueskyMarketSignals({ artists: [artist], runDate: createdAt.slice(0, 10), delayMs: 0,
    fetchImpl: async () => Response.json({ posts: [{ uri: "at://did:plc:fan/app.bsky.feed.post/future", author: { handle: "fan.bsky.social" },
      record: { text: "Lil Tecca album is fire", createdAt }, likeCount: 200 }] }) });
  expect(result.signals[artist.id].rawPayload.postCount).toBe(0);
  expect(result.signals[artist.id].stats).toEqual({});
});

it("does not establish artist identity from a URL slug alone", async () => {
  const result = await collectBlueskyMarketSignals({ artists: [artist], runDate: "2026-10-14", delayMs: 0,
    fetchImpl: async () => Response.json({ posts: [{ uri: "at://did:plc:fan/app.bsky.feed.post/url", author: { handle: "fan.bsky.social" },
      record: { text: "this album is fire https://example.com/lil-tecca/album", createdAt: "2026-10-14T01:00:00Z" }, likeCount: 200 }] }) });
  expect(result.signals[artist.id].rawPayload.postCount).toBe(0);
  expect(result.signals[artist.id].stats).toEqual({});
});
