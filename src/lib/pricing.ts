import type { HypeStats } from "@/lib/types";

// The displayed Signal Breakdown and the quote calculation share these exact
// coefficients so the UI cannot describe a different model than the one used.
export const PRICE_SIGNAL_WEIGHTS = Object.freeze({
  listening: 0.35,
  video: 0.25,
  search: 0.075,
  fanResponse: 0.075,
  media: 0.075,
  trading: 0.1
});

export const SCORE_SIGNAL_WEIGHTS = Object.freeze({
  ...PRICE_SIGNAL_WEIGHTS,
  media: 0.15
});

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
    stats.streamingGrowth * SCORE_SIGNAL_WEIGHTS.listening +
    stats.youtubeGrowth * SCORE_SIGNAL_WEIGHTS.video +
    stats.searchGrowth * SCORE_SIGNAL_WEIGHTS.search +
    stats.socialGrowth * SCORE_SIGNAL_WEIGHTS.fanResponse +
    (stats.newsScore - 50) * SCORE_SIGNAL_WEIGHTS.media +
    stats.traderDemand * SCORE_SIGNAL_WEIGHTS.trading;

  return Math.round(clamp(50 + momentum * 1.4, 1, 100));
}

export function calculateSignalDelta(stats: HypeStats) {
  const weightedMomentum =
    stats.streamingGrowth * PRICE_SIGNAL_WEIGHTS.listening +
    stats.youtubeGrowth * PRICE_SIGNAL_WEIGHTS.video +
    stats.searchGrowth * PRICE_SIGNAL_WEIGHTS.search +
    stats.socialGrowth * PRICE_SIGNAL_WEIGHTS.fanResponse +
    (stats.newsScore - 50) * PRICE_SIGNAL_WEIGHTS.media +
    stats.traderDemand * PRICE_SIGNAL_WEIGHTS.trading;

  return weightedMomentum / 100;
}
