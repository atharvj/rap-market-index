import { describe, expect, it } from "vitest";
import { readPublicIndicator, readPublicReception } from "@/lib/public-market-indicators";
import type { MarketObservationSeries } from "@/lib/types";
const row = (key: string, value: number | null, date = "2026-10-18"): MarketObservationSeries => ({
  key, source: key.split(":")[0], metric: key.split(":")[1], label: key, unit: "", points: [], latestValue: value, latestDate: date
});
describe("public market indicator meaning", () => {
  it("keeps measured zero distinct from missing and non-finite data", () => {
    expect(readPublicIndicator([row("apple_charts:chart_points", 0)], "apple_charts:chart_points")?.value).toBe(0);
    for (const value of [null, Number.NaN, Number.POSITIVE_INFINITY]) expect(readPublicIndicator([row("value", value)], "value")).toBeNull();
    expect(readPublicIndicator([], "value")).toBeNull();
  });
  it("does not invalidate a YouTube sample when social reception is unavailable", () => {
    const series = [row("youtube_comments:positive_comment_share", 28), row("youtube_comments:negative_comment_share", 2),
      row("youtube_comments:comment_count", 50), row("youtube_comments:classified_comment_count", 15),
      row("youtube_comments:reception_available", 1), row("bluesky:reaction_count", 0),
      row("bluesky:reaction_sentiment", 0), row("bluesky:reception_available", 0)];
    expect(readPublicReception(series, "youtube_comments")).toMatchObject({ available: true, positive: 28, negative: 2, count: 50, classifiedCount: 15 });
    expect(readPublicReception(series, "bluesky")).toMatchObject({ available: false, count: 0, score: null });
  });
  it("does not attach yesterday's estimate to today's sample counts", () => {
    const series = [row("youtube_comments:positive_comment_share", 85, "2026-10-17"), row("youtube_comments:comment_count", 2), row("youtube_comments:classified_comment_count", 1)];
    expect(readPublicReception(series, "youtube_comments")).toMatchObject({ available: false, count: 2, positive: null });
  });
  it("withholds the last successful sample counts after a newer failed collection", () => {
    const series = [row("youtube_comments:positive_comment_share", 85, "2026-10-17"), row("youtube_comments:comment_count", 50, "2026-10-17"), row("youtube_comments:reception_available", 0)];
    expect(readPublicReception(series, "youtube_comments")).toMatchObject({ available: false, count: null, positive: null });
  });
  it("does not apply an old outage marker to newer reception", () => {
    expect(readPublicReception([row("youtube_comments:reception_available", 0, "2026-10-17"), row("youtube_comments:positive_comment_share", 28)], "youtube_comments"))
      .toMatchObject({ available: true, positive: 28 });
  });
  it("distinguishes measured neutral sentiment from an empty reaction sample", () => {
    expect(readPublicReception([row("bluesky:reaction_count", 8), row("bluesky:reaction_sentiment", 0)], "bluesky"))
      .toMatchObject({ available: true, score: 0 });
    expect(readPublicReception([row("bluesky:reaction_count", 0), row("bluesky:reaction_sentiment", 0)], "bluesky"))
      .toMatchObject({ available: false, score: null });
  });
  it("withholds impossible reception percentages", () => {
    expect(readPublicReception([row("youtube_comments:positive_comment_share", 101)], "youtube_comments"))
      .toMatchObject({ available: false, positive: null });
  });
});
