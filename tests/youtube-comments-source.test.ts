import { describe, expect, it } from "vitest";
import type { MarketUpdateArtist } from "@/server/market/daily-update";
import { collectYoutubeCommentMarketSignals } from "@/server/market/youtube-comments-source";

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

function createYoutubeFetch(comments: Array<{ text: string; likes: number }>): typeof fetch {
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

    if (url.pathname.endsWith("/commentThreads")) {
      return jsonResponse({
        items: comments.map((comment) => ({
          snippet: {
            topLevelComment: {
              snippet: {
                textOriginal: comment.text,
                likeCount: comment.likes,
                publishedAt: "2026-08-22T00:00:00Z"
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
