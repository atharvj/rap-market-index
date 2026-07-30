import { describe, expect, it } from "vitest";
import {
  areEquivalentNewsLinks,
  selectPreferredNewsSourceEvent,
  shouldShowNewsMediaAction,
  shouldShowNewsSourceAction
} from "@/lib/market-news-links";

describe("market news actions", () => {
  it("shows one play action for a direct YouTube release", () => {
    const item = {
      eventType: "release",
      sourceUrl: "https://youtu.be/VideoId123",
      mediaUrl: "https://www.youtube.com/watch?v=VideoId123",
      mediaType: "youtube",
      mediaLabel: "Watch"
    };

    expect(shouldShowNewsMediaAction(item)).toBe(true);
    expect(shouldShowNewsSourceAction(item)).toBe(false);
  });

  it("shows both article and play actions for release coverage with a separate video", () => {
    const item = {
      eventType: "release",
      sourceUrl: "https://example.com/new-song-review",
      mediaUrl: "https://www.youtube.com/watch?v=VideoId123",
      mediaType: "youtube",
      mediaLabel: "Watch"
    };

    expect(shouldShowNewsMediaAction(item)).toBe(true);
    expect(shouldShowNewsSourceAction(item)).toBe(true);
  });

  it("does not use a play action for a non-release YouTube story", () => {
    const item = {
      eventType: "viral",
      sourceUrl: "https://www.youtube.com/watch?v=VideoId123",
      mediaUrl: "https://www.youtube.com/watch?v=VideoId123",
      mediaType: "youtube",
      mediaLabel: "Watch"
    };

    expect(shouldShowNewsMediaAction(item)).toBe(false);
    expect(shouldShowNewsSourceAction(item)).toBe(true);
  });

  it("prefers an editorial article over a direct media source in a grouped story", () => {
    const video = {
      id: "video",
      source_url: "https://www.youtube.com/watch?v=VideoId123",
      source_name: "YouTube"
    };
    const article = {
      id: "article",
      source_url: "https://example.com/artist-releases-song",
      source_name: "Example Music"
    };

    expect(selectPreferredNewsSourceEvent(video, [video, article])).toBe(article);
    expect(areEquivalentNewsLinks(video.source_url, "https://youtu.be/VideoId123")).toBe(true);
  });
});
