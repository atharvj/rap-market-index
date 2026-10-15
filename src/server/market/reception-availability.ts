import type { MarketObservationSeries } from "@/lib/types";
import type { MarketObservation } from "@/server/market/market-data";

export function unavailableReception(artistId: string, source: "bluesky" | "youtube_comments", runDate: string): MarketObservation {
  return { artistId, source, metric: "reception_available", observedDate: runDate, value: 0, unit: "boolean",
    rawPayload: { source, status: "unavailable" } };
}

const RECEPTION_METRICS: Record<string, Set<string>> = {
  youtube_comments: new Set(["comment_sentiment", "positive_comment_share", "negative_comment_share"]),
  bluesky: new Set(["reaction_sentiment"])
};

// Preserve recorded history while withholding an outdated headline estimate
// when a later collection has insufficient evidence or failed. Unknown is not 0.
export function maskUnavailableReception(series: MarketObservationSeries[]) {
  return series.map(item => {
    if (!RECEPTION_METRICS[item.source]?.has(item.metric)) return item;
    const quality = series.find(candidate => candidate.key === `${item.source}:reception_available`);
    if (quality?.latestValue === 0 && quality.latestDate && item.latestDate && quality.latestDate >= item.latestDate) {
      return { ...item, latestValue: null, latestDate: null };
    }
    return item;
  });
}
