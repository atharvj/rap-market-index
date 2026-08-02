import { clamp } from "@/lib/pricing";
import type { HypeStats } from "@/lib/types";
import type { AdapterSignal, AdapterSignals } from "@/server/market/market-data";

type CalibrationRule = {
  neutral: number;
  min: number;
  max: number;
  minimumMedianShift: number;
};

export type MarketWideCalibrationAudit = {
  rawValue: number;
  adjustedValue: number;
  marketMedian: number;
  coverageRatio: number;
  directionalBreadth: number;
  sampleCount: number;
};

type CalibrationAdjustment = Omit<MarketWideCalibrationAudit, "rawValue" | "adjustedValue">;

const CALIBRATABLE_SOURCES = new Set([
  "gdelt",
  "lastfm",
  "listenbrainz",
  "spotify",
  "wikimedia",
  "youtube"
]);

const CALIBRATION_RULES: Record<keyof HypeStats, CalibrationRule> = {
  streamingGrowth: { neutral: 0, min: -25, max: 75, minimumMedianShift: 0.75 },
  youtubeGrowth: { neutral: 0, min: -25, max: 70, minimumMedianShift: 0.75 },
  searchGrowth: { neutral: 0, min: -30, max: 95, minimumMedianShift: 1.5 },
  socialGrowth: { neutral: 0, min: -35, max: 120, minimumMedianShift: 1.5 },
  newsScore: { neutral: 50, min: 0, max: 100, minimumMedianShift: 1.5 },
  traderDemand: { neutral: 0, min: -40, max: 40, minimumMedianShift: 1 }
};

const MINIMUM_SAMPLE_COUNT = 12;
const MINIMUM_COVERAGE_RATIO = 0.75;
const MINIMUM_DIRECTIONAL_BREADTH = 0.85;
const DIRECTION_EPSILON = 0.0001;

/**
 * Removes a shared source-wide shift while preserving artist-to-artist differences.
 * This protects relative artist signals from provider delays and reporting-window changes.
 */
export function calibrateMarketWideAdapterSignals(
  sources: Array<AdapterSignals | undefined>
): AdapterSignals[] {
  const availableSources = sources.filter((source): source is AdapterSignals => Boolean(source));
  const marketArtistCount = new Set(availableSources.flatMap((source) => Object.keys(source))).size;

  if (marketArtistCount < MINIMUM_SAMPLE_COUNT) {
    return availableSources;
  }

  return availableSources.map((signals) => calibrateSourceSignals(signals, marketArtistCount));
}

export function calibratePersistedMarketStats<T extends { id: string; stats: HypeStats }>(artists: T[]) {
  const adjustments = getCalibrationAdjustments(
    artists.map((artist) => artist.stats),
    artists.length
  );
  const audits: Record<string, Partial<Record<keyof HypeStats, MarketWideCalibrationAudit>>> = {};

  if (!adjustments.size) {
    return { artists, audits };
  }

  return {
    artists: artists.map((artist) => {
      const stats = { ...artist.stats };

      for (const [key, adjustment] of adjustments) {
        const rawValue = stats[key];
        const rule = CALIBRATION_RULES[key];
        const adjustedValue = clamp(rawValue - adjustment.marketMedian, rule.min, rule.max);
        stats[key] = adjustedValue;
        audits[artist.id] ??= {};
        audits[artist.id][key] = {
          ...adjustment,
          rawValue,
          adjustedValue
        };
      }

      return { ...artist, stats };
    }),
    audits
  };
}

function calibrateSourceSignals(signals: AdapterSignals, marketArtistCount: number): AdapterSignals {
  const sourceName = getDominantSourceName(signals);

  if (!sourceName || !CALIBRATABLE_SOURCES.has(sourceName)) {
    return signals;
  }

  const adjustments = getCalibrationAdjustments(
    Object.values(signals).map((signal) => signal.stats),
    marketArtistCount
  );

  if (!adjustments.size) {
    return signals;
  }

  return Object.fromEntries(
    Object.entries(signals).map(([artistId, signal]) => [
      artistId,
      applySignalCalibration(signal, adjustments)
    ])
  );
}

function getCalibrationAdjustments(
  stats: Array<Partial<HypeStats>>,
  marketArtistCount: number
) {
  const adjustments = new Map<keyof HypeStats, CalibrationAdjustment>();

  for (const [key, rule] of Object.entries(CALIBRATION_RULES) as Array<
    [keyof HypeStats, CalibrationRule]
  >) {
    const directionalValues = stats
      .map((value) => value[key])
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
      .map((value) => value - rule.neutral);

    if (directionalValues.length < MINIMUM_SAMPLE_COUNT) {
      continue;
    }

    const coverageRatio = directionalValues.length / Math.max(1, marketArtistCount);
    const positiveCount = directionalValues.filter((value) => value > DIRECTION_EPSILON).length;
    const negativeCount = directionalValues.filter((value) => value < -DIRECTION_EPSILON).length;
    const directionalBreadth = Math.max(positiveCount, negativeCount) / directionalValues.length;
    const marketMedian = median(directionalValues);

    if (
      coverageRatio < MINIMUM_COVERAGE_RATIO ||
      directionalBreadth < MINIMUM_DIRECTIONAL_BREADTH ||
      Math.abs(marketMedian) < rule.minimumMedianShift
    ) {
      continue;
    }

    adjustments.set(key, {
      marketMedian,
      coverageRatio,
      directionalBreadth,
      sampleCount: directionalValues.length
    });
  }

  return adjustments;
}

function applySignalCalibration(
  signal: AdapterSignal,
  adjustments: Map<keyof HypeStats, CalibrationAdjustment>
): AdapterSignal {
  const stats = { ...signal.stats };
  const metricAudits: Partial<Record<keyof HypeStats, MarketWideCalibrationAudit>> = {};

  for (const [key, adjustment] of adjustments) {
    const rawValue = stats[key];

    if (typeof rawValue !== "number" || !Number.isFinite(rawValue)) {
      continue;
    }

    const rule = CALIBRATION_RULES[key];
    const adjustedValue = clamp(rawValue - adjustment.marketMedian, rule.min, rule.max);
    stats[key] = adjustedValue;
    metricAudits[key] = {
      ...adjustment,
      rawValue,
      adjustedValue
    };
  }

  if (!Object.keys(metricAudits).length) {
    return signal;
  }

  return {
    ...signal,
    stats,
    rawPayload: {
      ...signal.rawPayload,
      marketWideCalibration: {
        version: 1,
        reason: "source_wide_directional_shift",
        metrics: metricAudits
      }
    }
  };
}

function getDominantSourceName(signals: AdapterSignals) {
  const counts = new Map<string, number>();

  for (const signal of Object.values(signals)) {
    const source = signal.rawPayload.source;

    if (typeof source === "string" && source) {
      counts.set(source, (counts.get(source) ?? 0) + 1);
    }
  }

  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
}

function median(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2
    ? sorted[middle]
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}
