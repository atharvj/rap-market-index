import type { MarketNewsSort } from "@/lib/market-news-sort";

const MAX_NEWS_CANDIDATES = 500;

export function getMarketNewsCandidateLimit({
  feedMode,
  limit,
  sort
}: {
  feedMode: "home" | "news" | "artist" | "watch";
  limit: number;
  sort: MarketNewsSort;
}) {
  if (sort === "top" || feedMode === "watch") {
    return MAX_NEWS_CANDIDATES;
  }

  return Math.min(MAX_NEWS_CANDIDATES, Math.max(1, limit) * 6);
}
