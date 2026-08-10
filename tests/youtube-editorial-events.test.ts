import { describe, expect, it } from "vitest";
import type { MarketUpdateArtist } from "@/server/market/daily-update";
import { buildYoutubeEditorialEvents } from "@/server/market/youtube-editorial-events-source";

function artist(overrides: Partial<MarketUpdateArtist> = {}): MarketUpdateArtist {
  return {
    id: "osamason",
    name: "OsamaSon",
    ticker: "OSAMA",
    currentPrice: 40,
    previousClose: 40,
    hypeScore: 50,
    volatility: 1,
    category: "underground",
    stats: {
      streamingGrowth: 0,
      youtubeGrowth: 0,
      searchGrowth: 0,
      socialGrowth: 0,
      newsScore: 50,
      traderDemand: 0
    },
    ...overrides
  };
}

const publisher = {
  name: "Genius",
  channelId: "UCyFZMEnm1il5Wv3a6tPscbA",
  uploadsPlaylistId: "UUyFZMEnm1il5Wv3a6tPscbA",
  authority: "primary" as const
};

function video(overrides: Record<string, unknown> = {}) {
  return {
    id: "VideoId123",
    title: "OsamaSon “off that!” Official Lyrics & Meaning | Genius Verified",
    description: "OsamaSon dissects his hit song off that and explains the lyrics.",
    publishedAt: "2026-08-05T14:58:06Z",
    durationSeconds: 273,
    viewCount: 31_924,
    likeCount: 10_124,
    commentCount: 1_237,
    ...overrides
  };
}

describe("trusted YouTube editorial catalysts", () => {
  it("turns the music-focused Genius interview into a source-backed event", () => {
    const events = buildYoutubeEditorialEvents({
      artists: [artist()],
      runDate: "2026-08-05",
      publisher,
      videos: [video()]
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      artistId: "osamason",
      eventDate: "2026-08-05",
      eventType: "news",
      sourceName: "Genius"
    });
    expect(events[0].rawPayload).toMatchObject({
      source: "youtube_editorial_event",
      classificationReason: "lyrics_interview",
      editorialAttentionVerified: true,
      musicDemandConfirmed: false,
      videoId: "VideoId123"
    });
    expect(events[0].impactScore).toBeGreaterThan(15);
  });

  it("requires real music context and rejects shorts or negligible reach", () => {
    const events = buildYoutubeEditorialEvents({
      artists: [artist()],
      runDate: "2026-08-05",
      publisher,
      videos: [
        video({ title: "OsamaSon interview about his favorite sneakers", description: "A fashion conversation." }),
        video({ durationSeconds: 52 }),
        video({ viewCount: 800, likeCount: 50, commentCount: 3 })
      ]
    });

    expect(events).toEqual([]);
  });

  it("scales identical reach more strongly for a smaller artist", () => {
    const events = buildYoutubeEditorialEvents({
      artists: [
        artist(),
        artist({ id: "major", name: "Major Artist", ticker: "MAJOR", currentPrice: 120, category: "superstar" })
      ],
      runDate: "2026-08-05",
      publisher,
      videos: [
        video({ title: "OsamaSon and Major Artist discuss their new song" })
      ]
    });

    const undergroundImpact = events.find((event) => event.artistId === "osamason")?.impactScore ?? 0;
    const superstarImpact = events.find((event) => event.artistId === "major")?.impactScore ?? 0;

    expect(undergroundImpact).toBeGreaterThan(superstarImpact);
  });
});
