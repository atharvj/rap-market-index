import type { MarketObservationSeries } from "@/lib/types";

export type PublicIndicatorValue = { value: number; date: string };

export function readPublicIndicator(series: MarketObservationSeries[], key: string): PublicIndicatorValue | null {
  const item = series.find(candidate => candidate.key === key);
  if (!item || typeof item.latestValue !== "number" || !Number.isFinite(item.latestValue) ||
    !item.latestDate || !/^\d{4}-\d{2}-\d{2}$/.test(item.latestDate) || !Number.isFinite(Date.parse(item.latestDate))) return null;
  return { value: item.latestValue, date: item.latestDate };
}

// Reception percentages and sample counts must refer to the same collection day.
// A failed source cannot invalidate another source or revive an older estimate.
export function readPublicReception(series: MarketObservationSeries[], source: "youtube_comments" | "bluesky") {
  const names = source === "youtube_comments"
    ? ["reception_available", "positive_comment_share", "negative_comment_share", "comment_count", "classified_comment_count", "catalogue_video_count"]
    : ["reception_available", "reaction_sentiment", "reaction_count"];
  const values = names.map(name => readPublicIndicator(series, `${source}:${name}`));
  const date = values.flatMap(item => item ? [item.date] : []).sort().at(-1);
  if (!date) return null;
  const read = (name: string) => {
    const item = readPublicIndicator(series, `${source}:${name}`);
    return item?.date === date ? item.value : null;
  };
  const count = read(source === "youtube_comments" ? "comment_count" : "reaction_count");
  const classifiedCount = source === "youtube_comments" ? read("classified_comment_count") : count;
  const usable = read("reception_available") !== 0 && classifiedCount !== 0 && count !== 0;
  const share = (name: string) => {
    const value = read(name);
    return usable && value !== null && value >= 0 && value <= 100 ? value : null;
  };
  const sentiment = read("reaction_sentiment");
  const positive = share("positive_comment_share"), negative = share("negative_comment_share");
  const score = usable && sentiment !== null && sentiment >= -100 && sentiment <= 100 ? sentiment : null;
  return { date, count, classifiedCount, positive, negative, score,
    available: source === "youtube_comments" ? positive !== null || negative !== null : score !== null,
    catalogueCount: read("catalogue_video_count") };
}
