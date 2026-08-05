import { describe, expect, it } from "vitest";
import {
  getYoutubeVideoId,
  isWatchNowMarketEvent
} from "@/server/market/watch-now-videos";

function event(overrides: Record<string, unknown> = {}) {
  return {
    title: "Artist - New Track (Official Music Video)",
    source_url: "https://www.youtube.com/watch?v=VideoId123",
    raw_payload: {
      source: "youtube_upload_event",
      videoId: "VideoId123",
      durationSeconds: 205,
      classificationReason: "official_video_upload_title",
      ...overrides
    }
  };
}

describe("Watch Now video eligibility", () => {
  it("accepts a full-length official music video", () => {
    expect(isWatchNowMarketEvent(event())).toBe(true);
  });

  it("rejects official audio, visualizers, and short-form uploads", () => {
    expect(isWatchNowMarketEvent(event({
      classificationReason: "track_audio_upload_title"
    }))).toBe(false);
    expect(isWatchNowMarketEvent({
      ...event(),
      title: "Artist - New Track (Visualizer)"
    })).toBe(false);
    expect(isWatchNowMarketEvent(event({ durationSeconds: 54 }))).toBe(false);
  });

  it("rejects non-YouTube and non-official video events", () => {
    expect(isWatchNowMarketEvent(event({ source: "media_rss_item" }))).toBe(false);
    expect(isWatchNowMarketEvent({
      ...event({ classificationReason: "single_upload_title" }),
      title: "Artist discusses the new track"
    })).toBe(false);
  });

  it("accepts trusted full-length music interviews and performances", () => {
    expect(isWatchNowMarketEvent(event({
      source: "youtube_editorial_event",
      classificationReason: "lyrics_interview"
    }))).toBe(true);
    expect(isWatchNowMarketEvent(event({
      source: "youtube_editorial_event",
      classificationReason: "editorial_performance"
    }))).toBe(true);
  });

  it("rejects unclassified editorial uploads and editorial shorts", () => {
    expect(isWatchNowMarketEvent(event({
      source: "youtube_editorial_event",
      classificationReason: "generic_interview"
    }))).toBe(false);
    expect(isWatchNowMarketEvent(event({
      source: "youtube_editorial_event",
      classificationReason: "music_interview",
      durationSeconds: 60
    }))).toBe(false);
  });

  it("recovers IDs from standard, short, and embed URLs", () => {
    expect(getYoutubeVideoId({}, "https://www.youtube.com/watch?v=Standard123")).toBe("Standard123");
    expect(getYoutubeVideoId({}, "https://youtu.be/ShortId123")).toBe("ShortId123");
    expect(getYoutubeVideoId({}, "https://www.youtube.com/embed/EmbedId123")).toBe("EmbedId123");
  });
});
