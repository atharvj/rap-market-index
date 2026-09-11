import { clamp } from "@/lib/pricing";

export const AUDIENCE_VALUATION_VERSION = 2;
export type AudienceInputs = {
  monthlyListeners?: number | null;
  lastfmListeners?: number | null;
  lastfmPlays?: number | null;
  youtubeSubscribers?: number | null;
  youtubeViews?: number | null;
};

// Fixed platform scales and weights apply to every artist, regardless of name,
// category, listing date, or the other artists currently on the market.
const METRICS = [
  { input: "monthlyListeners", key: "spotify_monthly_listeners", source: "spotify", low: 10_000, high: 100_000_000, weight: 0.5 },
  { input: "lastfmListeners", key: "lastfm_listeners", source: "lastfm", low: 5_000, high: 5_000_000, weight: 0.18 },
  { input: "lastfmPlays", key: "lastfm_plays", source: "lastfm", low: 100_000, high: 2_000_000_000, weight: 0.1 },
  { input: "youtubeSubscribers", key: "youtube_subscribers", source: "youtube", low: 2_000, high: 30_000_000, weight: 0.12 },
  { input: "youtubeViews", key: "youtube_views", source: "youtube", low: 500_000, high: 20_000_000_000, weight: 0.1 }
] as const;

export function calculateAudienceValuation(inputs: AudienceInputs) {
  const metrics = METRICS.flatMap(definition => {
    const value = inputs[definition.input];
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return [];
    return [{
      key: definition.key, source: definition.source, value, weight: definition.weight,
      score: clamp(Math.log10(value / definition.low) / Math.log10(definition.high / definition.low), 0, 1)
    }];
  });
  const coverage = metrics.reduce((total, metric) => total + metric.weight, 0);
  const directSourceCount = new Set(metrics.map(metric => metric.source)).size;
  const confidence = Math.min(0.98, (0.35 + coverage * 0.65) * (directSourceCount >= 2 ? 1 : 0.7));
  const enough = metrics.some(metric => metric.source === "spotify") || metrics.length >= 2;
  const score = enough ? metrics.reduce((sum, metric) => sum + metric.score * metric.weight, 0) / coverage : null;
  return {
    version: AUDIENCE_VALUATION_VERSION,
    status: enough ? "ok" as const : "insufficient_data" as const,
    score: score === null ? null : round(score * 100),
    targetPrice: score === null ? null : Math.round((8 + 132 * Math.pow(score, 1.6)) * 100) / 100,
    coverage: round(coverage), confidence: round(confidence), metricCount: metrics.length, directSourceCount, metrics
  };
}

function round(value: number) { return Math.round(value * 1000) / 1000; }
