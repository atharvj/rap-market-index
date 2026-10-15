import { describe, expect, it } from "vitest";
import type { MarketUpdateArtist } from "@/server/market/daily-update";
import { collectYoutubeCommentMarketSignals, scoreCommentSentiment, selectCommentVideos } from "@/server/market/youtube-comments-source";
import type { MarketEvent } from "@/server/market/market-data";
import { calculateSignalDelta } from "@/lib/pricing";

const artist: MarketUpdateArtist = {
  id: "test-artist",
  name: "Test Artist",
  ticker: "TEST",
  currentPrice: 60,
  previousClose: 60,
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

describe("YouTube comment reception", () => {
  it.each([
    ["not bad", 1], ["not trash", 1], ["no skips", 1],
    ["not fire", -1], ["isn't good", -1], ["I don't like this album", -1],
    ["hate this boring album", -1], ["crazy how terrible this is", -1],
    ["🔥🔥", 1], ["🤮", -1], ["trash 🔥", -1], ["hard to listen to", -1]
  ])("handles reception and negation in %s", (text, direction) => {
    expect(scoreCommentSentiment(String(text)) * Number(direction)).toBeGreaterThan(0);
  });
  it("does not treat neutral attention as approval", () => {
    expect(scoreCommentSentiment("crazy, 100 million views already")).toBe(0);
  });
  it("lets commercial success outweigh criticism while still including its drag", () => {
    const commercial = { ...artist.stats, streamingGrowth: 12, youtubeGrowth: 8, newsScore: 65 };
    const mixed = { ...commercial, socialGrowth: -35 };
    expect(calculateSignalDelta(mixed)).toBeGreaterThan(0);
    expect(calculateSignalDelta(mixed)).toBeLessThan(calculateSignalDelta(commercial));
  });
  it("keeps viral criticism negative and does not invent search or view growth", async () => {
    const comments = Array.from({ length: 25 }, (_, i) => ({ text: "trash boring album", likes: 500 + i }));
    const first = await collect(comments);
    const baseline = Object.fromEntries(first.observations.map(o => [o.metric, o.value]));
    const second = await collect(comments, { ...baseline, comment_like_count: 10, comment_count: 12, comment_sentiment: -90, negative_comment_share: 100 });
    expect(second.signals[artist.id].stats.socialGrowth).toBeLessThan(0);
    expect(second.signals[artist.id].stats.searchGrowth).toBeUndefined();
    expect(second.signals[artist.id].stats.youtubeGrowth).toBeUndefined();
  });
  it("deduplicates both sort orders and limits a prolific author", async () => {
    const result = await collect(Array.from({ length: 30 }, (_, i) => ({ text: "fire masterpiece", likes: i, author: "same-author" })));
    expect(result.signals[artist.id].rawPayload.sampledCommentCount).toBe(1);
    expect(result.signals[artist.id].stats).toEqual({});
    expect(result.signals[artist.id].confidence).toBe(0);
  });
  it("does not use old or future comments as current reception", async () => {
    for (const date of ["2025-08-22T00:00:00Z", "2026-08-25T00:00:00Z"]) {
      const result = await collect(Array.from({ length: 15 }, () => ({ text: "trash worst", likes: 10, date })));
      expect(result.signals[artist.id].rawPayload.sampledCommentCount).toBe(0);
      expect(result.signals[artist.id].stats).toEqual({});
    }
  });
  it("leaves unclassified text unavailable instead of claiming neutral consensus", async () => {
    const result = await collect(Array.from({ length: 20 }, () => ({ text: "first comment, hello from London", likes: 10 })));
    expect(result.signals[artist.id].rawPayload.classifiedCommentCount).toBe(0);
    expect(result.signals[artist.id].stats).toEqual({});
  });
  it("rejects unverified uploaders and uses verified collaborators' recordings", async () => {
    const featured = { ...artist, id: "featured", name: "Featured Artist", ticker: "FEAT" };
    const event: MarketEvent = { artistId: artist.id, eventDate: "2026-08-21", eventType: "release", title: "Test Artist - Song (feat. Featured Artist)",
      sourceUrl: "https://www.youtube.com/watch?v=abcdefghijk", sentimentScore: 25, impactScore: 30, confidence: 0.9,
      rawPayload: { source: "youtube_upload_event", videoId: "abcdefghijk", channelId: "UC-test-artist", durationSeconds: 210 } };
    expect(selectCommentVideos([event], "2026-08-24", 3)).toHaveLength(1);
    expect(selectCommentVideos([{ ...event, rawPayload: { source: "media_rss_item", videoId: "abcdefghijk" } }], "2026-08-24", 3)).toEqual([]);
    const fake = createYoutubeFetch(Array.from({ length: 15 }, () => ({ text: "trash terrible", likes: 10 })));
    const result = await collectYoutubeCommentMarketSignals({ artists: [artist, featured], events: { [artist.id]: [event] }, runDate: "2026-08-24", apiKey: "test", delayMs: 0,
      fetchImpl: async input => new URL(String(input)).pathname.endsWith("/videos") ? jsonResponse({ items: [{ id: "abcdefghijk", snippet: { channelId: "UC-test-artist" } }] }) : fake(input) });
    expect(result.signals[featured.id].stats.socialGrowth).toBeLessThan(0);
    expect(result.signals[featured.id].stats).toEqual(result.signals[artist.id].stats);
    const rejected = await collectYoutubeCommentMarketSignals({ artists: [artist], events: { [artist.id]: [event] }, runDate: "2026-08-24", apiKey: "test", delayMs: 0,
      fetchImpl: async () => jsonResponse({ items: [{ id: "abcdefghijk", snippet: { channelId: "wrong-channel" } }] }) });
    expect(rejected.signals[artist.id].stats).toEqual({});
    expect(rejected.observations.map(o => o.metric)).toEqual(["request_error", "reception_available"]);
    expect(rejected.observations.find(o => o.metric === "reception_available")?.value).toBe(0);
  });
  it("shows strongly negative reception on the first sample instead of forcing it flat", async () => {
    const result = await collectYoutubeCommentMarketSignals({
      artists: [artist],
      runDate: "2026-08-24",
      apiKey: "test-key",
      externalIds: {
        [artist.id]: { artistId: artist.id, youtubeChannelId: "UC-test-artist" }
      },
      maxVideosPerArtist: 1,
      maxCommentsPerVideo: 25,
      delayMs: 0,
      fetchImpl: createYoutubeFetch(Array.from({ length: 15 }, (_, index) => ({
        text: index % 2 ? "this is trash and terrible" : "worst song, this artist fell off",
        likes: 10 + index
      })))
    });

    expect(result.signals[artist.id].stats.socialGrowth).toBeLessThan(-10);
    expect(result.signals[artist.id].stats.newsScore).toBeUndefined();
    expect(result.signals[artist.id].rawPayload).toMatchObject({ status: "reception_baseline" });
  });
});

type TestComment = { text: string; likes: number; author?: string; date?: string };
function collect(comments: TestComment[], baseline: Record<string, number> = {}) {
  return collectYoutubeCommentMarketSignals({ artists: [artist], runDate: "2026-08-24", apiKey: "test",
    externalIds: { [artist.id]: { artistId: artist.id, youtubeChannelId: "UC-test-artist" } },
    baselines: { [artist.id]: baseline }, delayMs: 0, fetchImpl: createYoutubeFetch(comments) });
}
function createYoutubeFetch(comments: TestComment[]): typeof fetch {
  return async (input) => {
    const url = new URL(String(input));

    if (url.pathname.endsWith("/channels")) {
      return jsonResponse({
        items: [{ id: "UC-test-artist", contentDetails: { relatedPlaylists: { uploads: "UU-test-artist" } } }]
      });
    }

    if (url.pathname.endsWith("/playlistItems")) {
      return jsonResponse({
        items: [{
          snippet: {
            title: "Test Artist - New Song",
            publishedAt: "2026-08-21T00:00:00Z",
            resourceId: { videoId: "video-1" }
          },
          contentDetails: { videoId: "video-1" }
        }]
      });
    }

    if (url.pathname.endsWith("/videos")) return jsonResponse({ items: [{ id: "video-1", snippet: { channelId: "UC-test-artist" } }] });

    if (url.pathname.endsWith("/commentThreads")) {
      return jsonResponse({
        items: comments.map((comment, index) => ({
          snippet: {
            topLevelComment: {
              id: `comment-${index}`,
              snippet: {
                authorChannelId: { value: comment.author ?? `author-${index}` },
                textOriginal: comment.text,
                likeCount: comment.likes,
                publishedAt: comment.date ?? "2026-08-22T00:00:00Z"
              }
            },
            totalReplyCount: 0
          }
        }))
      });
    }

    throw new Error(`Unexpected YouTube request: ${url}`);
  };
}

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

it("asks for full pages in the same two calls and caps recent, deduplicated results", async () => {
  const requests: URL[] = [], original = createYoutubeFetch([]);
  const result = await collectYoutubeCommentMarketSignals({ artists: [artist], runDate: "2026-08-24", apiKey: "test", delayMs: 0,
    maxVideosPerArtist: 1, maxCommentsPerVideo: 20,
    externalIds: { [artist.id]: { artistId: artist.id, youtubeChannelId: "UC-test-artist" } }, fetchImpl: input => {
      const url = new URL(String(input));
      if (!url.pathname.endsWith("/commentThreads")) return original(input);
      requests.push(url);
      return createYoutubeFetch(Array.from({ length: 100 }, (_, i) => ({ text: "song is fire", likes: 0,
        author: `${url.searchParams.get("order")}-${i}`, date: i < 40 ? "2025-01-01T00:00:00Z" : "2026-08-22T00:00:00Z" })))(input);
    } });
  expect(requests).toHaveLength(2);
  expect(requests.every(url => url.searchParams.get("maxResults") === "100")).toBe(true);
  expect(result.signals[artist.id].rawPayload.sampledCommentCount).toBe(20);
  expect(result.signals[artist.id].stats.socialGrowth).toBeGreaterThan(0);
});

it("does not turn copied long reviews into an independent audience", async () => {
  const result = await collect(Array.from({ length: 30 }, () => ({ text: "This album review is clear: the entire new project is trash, boring and disappointing", likes: 1 })));
  expect(result.signals[artist.id].rawPayload.sampledCommentCount).toBe(1);
  expect(result.signals[artist.id].stats).toEqual({});
  expect(result.observations.find(o => o.metric === "reception_available")?.value).toBe(0);
});

it("does not score a collaborator's criticism as the primary artist's reception", async () => {
  const collaborator = { ...artist, id: "featured", name: "Featured Artist" };
  const event: MarketEvent = { artistId: artist.id, eventDate: "2026-08-21", eventType: "release", title: "Test Artist - Song (feat. Featured Artist)",
    sourceUrl: "https://www.youtube.com/watch?v=abcdefghijk", sentimentScore: 25, impactScore: 30, confidence: 0.9,
    rawPayload: { source: "youtube_upload_event", videoId: "abcdefghijk", channelId: "UC-test-artist", durationSeconds: 210 } };
  const comments = createYoutubeFetch(Array.from({ length: 20 }, (_, i) => ({ text: `Track ${i}: Test Artist verse is trash but Featured Artist verse is fire`, likes: 1 })));
  const result = await collectYoutubeCommentMarketSignals({ artists: [artist, collaborator], events: { [artist.id]: [event] }, runDate: "2026-08-24", apiKey: "test", delayMs: 0,
    fetchImpl: input => new URL(String(input)).pathname.endsWith("/videos") ? Promise.resolve(jsonResponse({ items: [{ id: "abcdefghijk", snippet: { channelId: "UC-test-artist" } }] })) : comments(input) });
  expect(result.signals[artist.id].stats.socialGrowth).toBeLessThan(0);
  expect(result.signals[collaborator.id].stats.socialGrowth).toBeGreaterThan(0);
});
