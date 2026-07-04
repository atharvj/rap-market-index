import type { HypeStats } from "@/lib/types";

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function roundPrice(value: number) {
  return Math.max(1, Math.round(value * 100) / 100);
}

export function getDailyChangePercent(currentPrice: number, previousClose: number) {
  return ((currentPrice - previousClose) / previousClose) * 100;
}

export function calculateHypeScore(stats: HypeStats) {
  const momentum =
    stats.streamingGrowth * 0.35 +
    stats.youtubeGrowth * 0.25 +
    ((stats.searchGrowth + stats.socialGrowth) / 2) * 0.15 +
    (stats.newsScore - 50) * 0.15 +
    stats.traderDemand * 0.1;

  return Math.round(clamp(50 + momentum * 1.4, 1, 99));
}

export function calculateSignalDelta(stats: HypeStats) {
  const weightedMomentum =
    stats.streamingGrowth * 0.35 +
    stats.youtubeGrowth * 0.25 +
    ((stats.searchGrowth + stats.socialGrowth) / 2) * 0.15 +
    ((stats.newsScore - 50) / 2) * 0.15 +
    stats.traderDemand * 0.1;

  return weightedMomentum / 100;
}
