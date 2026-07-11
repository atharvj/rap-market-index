import { clamp } from "@/lib/pricing";
import type { AdapterSignal, AdapterSignals } from "@/server/market/market-data";
import type { MarketUpdateArtist } from "@/server/market/daily-update";

type AudienceMetric = {
  key: string;
  value: number;
  score: number;
  weight: number;
};

export type AudienceScaleCalibration = {
  status: "ok" | "insufficient_data";
  score: number | null;
  targetPrice: number | null;
  coverage: number;
  metricCount: number;
  metrics: AudienceMetric[];
};

export type AudienceScaleSnapshots = Record<
  string,
  {
    lastfm?: { listeners?: number; playcount?: number };
    youtube?: { subscriberCount?: number; viewCount?: number };
    wikimedia?: { pageviews7d?: number };
  }
>;

const MIN_TARGET_PRICE = 5;
const MAX_TARGET_PRICE = 140;
const TOTAL_AVAILABLE_WEIGHT = 0.95;

/**
 * Adds a slow-moving valuation anchor without turning audience size into a
 * momentum signal. Daily growth and verified events still control daily moves.
 */
export function attachAudienceScaleCalibration({
  artists,
  signals,
  snapshots = {}
}: {
  artists: MarketUpdateArtist[];
  signals: AdapterSignals;
  snapshots?: AudienceScaleSnapshots;
}): AdapterSignals {
  return Object.fromEntries(
    artists.map((artist) => {
      const signal = signals[artist.id] ?? { stats: {}, rawPayload: {} };
      const calibration = buildAudienceScaleCalibration(signal, snapshots[artist.id]);

      return [
        artist.id,
        {
          ...signal,
          rawPayload: {
            ...signal.rawPayload,
            audienceScaleCalibration: calibration
          }
        } satisfies AdapterSignal
      ];
    })
  );
}

export function buildAudienceScaleCalibration(
  signal: AdapterSignal,
  snapshot?: AudienceScaleSnapshots[string]
): AudienceScaleCalibration {
  const freshLastfm = getRecord(signal.rawPayload.lastfm);
  const freshYoutube = getRecord(signal.rawPayload.youtube);
  const freshWikimedia = getRecord(signal.rawPayload.wikimedia);
  const lastfm = {
    listeners: getPositiveNumber(freshLastfm.listeners) ?? snapshot?.lastfm?.listeners,
    playcount: getPositiveNumber(freshLastfm.playcount) ?? snapshot?.lastfm?.playcount
  };
  const youtube = {
    subscriberCount: getPositiveNumber(freshYoutube.subscriberCount) ?? snapshot?.youtube?.subscriberCount,
    viewCount: getPositiveNumber(freshYoutube.viewCount) ?? snapshot?.youtube?.viewCount
  };
  const wikimedia = {
    pageviews7d: getPositiveNumber(freshWikimedia.pageviews7d) ?? snapshot?.wikimedia?.pageviews7d
  };
  const metrics = [
    buildMetric("lastfm_listeners", lastfm.listeners, 5_000, 5_000_000, 0.28),
    buildMetric("lastfm_plays", lastfm.playcount, 100_000, 2_000_000_000, 0.18),
    buildMetric("youtube_subscribers", youtube.subscriberCount, 2_000, 30_000_000, 0.25),
    buildMetric("youtube_views", youtube.viewCount, 500_000, 20_000_000_000, 0.19),
    buildMetric("public_attention", wikimedia.pageviews7d, 100, 1_000_000, 0.05)
  ].filter((metric): metric is AudienceMetric => Boolean(metric));
  const directMetrics = metrics.filter((metric) => metric.key !== "public_attention");
  const observedWeight = metrics.reduce((total, metric) => total + metric.weight, 0);
  const coverage = clamp(observedWeight / TOTAL_AVAILABLE_WEIGHT, 0, 1);

  if (directMetrics.length < 2 || observedWeight < 0.35) {
    return {
      status: "insufficient_data",
      score: null,
      targetPrice: null,
      coverage: round(coverage),
      metricCount: metrics.length,
      metrics
    };
  }

  const audienceScore = metrics.reduce((total, metric) => total + metric.score * metric.weight, 0) /
    Math.max(0.001, observedWeight);
  const targetPrice = MIN_TARGET_PRICE +
    (MAX_TARGET_PRICE - MIN_TARGET_PRICE) * Math.pow(clamp(audienceScore, 0, 1), 2.45);

  return {
    status: "ok",
    score: round(audienceScore * 100),
    targetPrice: round(targetPrice),
    coverage: round(coverage),
    metricCount: metrics.length,
    metrics
  };
}

export function getAudienceScaleAdjustment(rawPayload: Record<string, unknown>, currentPrice: number) {
  const calibration = getRecord(rawPayload.audienceScaleCalibration);
  const targetPrice = getPositiveNumber(calibration.targetPrice);
  const coverage = getFiniteNumber(calibration.coverage) ?? 0;

  if (!targetPrice || currentPrice <= 0 || calibration.status !== "ok") {
    return {
      adjustment: 0,
      targetPrice: null,
      coverage,
      gapPercent: 0
    };
  }

  const logarithmicGap = Math.log(targetPrice / currentPrice);
  const confidence = clamp(0.35 + coverage * 0.55, 0.35, 0.9);
  const adjustment = clamp(logarithmicGap * 0.085 * confidence, -0.04, 0.04);

  return {
    adjustment,
    targetPrice,
    coverage,
    gapPercent: round(((targetPrice - currentPrice) / currentPrice) * 100)
  };
}

function buildMetric(key: string, rawValue: unknown, low: number, high: number, weight: number): AudienceMetric | null {
  const value = getPositiveNumber(rawValue);

  if (!value) {
    return null;
  }

  const lowLog = Math.log10(low);
  const highLog = Math.log10(high);
  const score = clamp((Math.log10(value) - lowLog) / Math.max(0.001, highLog - lowLog), 0, 1);

  return {
    key,
    value,
    score: round(score),
    weight
  };
}

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function getFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getPositiveNumber(value: unknown) {
  const number = getFiniteNumber(value);
  return number !== null && number > 0 ? number : null;
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}
