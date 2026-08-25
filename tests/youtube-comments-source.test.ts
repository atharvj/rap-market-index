import { describe, expect, it } from "vitest";
import type { MarketUpdateArtist } from "@/server/market/daily-update";
import { collectYoutubeCommentMarketSignals } from "@/server/market/youtube-comments-source";

const artist: MarketUpdateArtist = {
  id: "nav",
  name: "NAV",
  ticker: "NAV",
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
      externalIds: { nav: { artistId: "nav", youtubeChannelId: "UCnav" } },
      maxVideosPerArtist: 1,
      maxCommentsPerVideo: 25,
      delayMs: 0,
      fetchImpl: createYoutubeFetch(Array.from({ length: 15 }, (_, index) => ({
        text: index % 2 ? "this is trash and terrible" : "worst song, NAV fell off",
        likes: 10 + index
      })))
    });

    expect(result.signals.nav.stats.socialGrowth).toBeLessThan(-10);
    expect(result.signals.nav.stats.newsScore).toBeUndefined();
    expect(result.signals.nav.rawPayload).toMatchObject({ status: "reception_baseline" });
  });
});

function createYoutubeFetch(comments: Array<{ text: string; likes: number }>): typeof fetch {
  return async (input) => {
    const url = new URL(String(input));

    if (url.pathname.endsWith("/channels")) {
      return jsonResponse({
        items: [{ id: "UCnav", contentDetails: { relatedPlaylists: { uploads: "UU-nav" } } }]
      });
    }

    if (url.pathname.endsWith("/playlistItems")) {
      return jsonResponse({
        items: [{
          snippet: {
            title: "NAV - New Song",
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
