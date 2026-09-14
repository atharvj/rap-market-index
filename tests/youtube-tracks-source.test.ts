import { describe, expect, it } from "vitest";
import { collectYoutubeTrackSignals, getTrackedVideoMetrics, selectTrackedVideos } from "@/server/market/youtube-tracks-source";
import type { MarketUpdateArtist } from "@/server/market/daily-update";
import type { MarketEvent, ObservationBaselines } from "@/server/market/market-data";

const artists = ["Skrilla", "1900Rugrat"].map(name => ({ id: name, name, ticker: name, currentPrice: 50, previousClose: 50,
  hypeScore: 50, volatility: 1, category: "rising", stats: { streamingGrowth: 0, youtubeGrowth: 0, searchGrowth: 0, socialGrowth: 0, newsScore: 50, traderDemand: 0 }
})) as MarketUpdateArtist[];
const event: MarketEvent = { artistId: "Skrilla", eventDate: "2026-09-04", eventType: "release",
  title: "Skrilla, 1900Rugrat - Remix (Official Video)", sourceUrl: "https://www.youtube.com/watch?v=abcdefghijk",
  sentimentScore: 25, impactScore: 30, confidence: 0.9,
  rawPayload: { source: "youtube_upload_event", channelId: "UCofficial", videoId: "abcdefghijk", classificationReason: "official_video_upload_title", durationSeconds: 210 } };
const baseline = { views_abcdefghijk: 100000, views_abcdefghijk__age_days: 1, views_abcdefghijk__recent_daily_rate: 10000, views_abcdefghijk__recent_rate_samples: 5 };
const events = selectTrackedVideos({ Skrilla: [event] }, artists);
async function collect(views: number, baselines: ObservationBaselines = { Skrilla: baseline, "1900Rugrat": baseline }, channel = "UCofficial") {
  return collectYoutubeTrackSignals({ artists, events, runDate: "2026-09-14", apiKey: "test", baselines,
    fetchImpl: async () => Response.json({ items: [{ id: "abcdefghijk", snippet: { channelId: channel }, statistics: { viewCount: String(views), likeCount: "0" } }] }) });
}
describe("recording-level audience velocity", () => {
  it("retains song audio and video candidates even when a publisher covers the same release", () => {
    const news = { ...event, confidence: 0.99, sourceUrl: "https://billboard.com/story", rawPayload: { source: "media_rss_item" } };
    const audio = { ...event, title: "Skrilla - Remix (Official Audio)", rawPayload: { ...event.rawPayload, classificationReason: "track_audio_upload_title" } };
    expect(getTrackedVideoMetrics(selectTrackedVideos({ Skrilla: [news, audio] }, artists))).toEqual(["views_abcdefghijk"]);
  });
  it("uses the uploader verified by video metadata when an official artist playlist points to a collaboration channel", async () => {
    const tracked = selectTrackedVideos({ Skrilla: [{ ...event, rawPayload: { ...event.rawPayload, videoChannelId: "UCcollaboration" } }] }, artists);
    const result = await collectYoutubeTrackSignals({ artists, events: tracked, runDate: "2026-09-14", apiKey: "test",
      fetchImpl: async () => Response.json({ items: [{ id: "abcdefghijk", snippet: { channelId: "UCcollaboration" }, statistics: { viewCount: "120000" } }] }) });
    expect(result.observations.map(observation => observation.artistId)).toEqual(["Skrilla", "1900Rugrat"]);
  });
  it("shares one verified video observation with both performers", async () => {
    expect(getTrackedVideoMetrics(events)).toEqual(["views_abcdefghijk"]);
    const result = await collect(120000);
    expect(result.signals.Skrilla.stats.youtubeGrowth).toBeGreaterThan(0);
    expect(result.signals["1900Rugrat"].stats).toEqual(result.signals.Skrilla.stats);
    expect(result.observations).toHaveLength(2);
    expect(result.observations[0].rawPayload.likes).toBe(0);
    expect(result.observations[0].rawPayload.comments).toBeNull();
  });
  it("distinguishes slowing views from accelerating views", async () => {
    expect((await collect(105000)).signals.Skrilla.stats.youtubeGrowth).toBeLessThan(0);
    expect((await collect(110000)).signals.Skrilla.stats.youtubeGrowth).toBe(0);
  });
  it("establishes a first baseline without inventing a rate", async () => {
    const result = await collect(120000, {});
    expect(result.signals.Skrilla.stats).toEqual({});
    expect(result.observations).toHaveLength(2);
  });
  it("reduces confidence when the comparison has few rate samples", async () => {
    const full = await collect(120000);
    const sparse = await collect(120000, { Skrilla: { ...baseline, views_abcdefghijk__recent_rate_samples: 1 } });
    expect(sparse.signals.Skrilla.confidence).toBeLessThan(full.signals.Skrilla.confidence!);
  });
  it("rejects counter resets and mismatched channels", async () => {
    expect((await collect(90000)).observations).toHaveLength(0);
    expect((await collect(120000, {}, "UCunrelated")).observations).toHaveLength(0);
  });
  it("does not convert unavailable videos into zero views", async () => {
    const result = await collectYoutubeTrackSignals({ artists, events, runDate: "2026-09-14", apiKey: "test",
      fetchImpl: async () => Response.json({ items: [] }) });
    expect(result.signals).toEqual({}); expect(result.observations).toHaveLength(0);
  });
});
