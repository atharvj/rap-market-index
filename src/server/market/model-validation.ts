import { calculateSignalDelta } from "@/lib/pricing";
import type { HypeStats } from "@/lib/types";

export type ValidationSignalSnapshot = HypeStats & {
  artistId: string;
  sourceDate: string;
};

export type ValidationAudienceObservation = {
  artistId: string;
  source: string;
  metric: string;
  observedDate: string;
  value: number;
};

export type MarketModelValidation = {
  status: "collecting" | "provisional" | "measured";
  horizonDays: number;
  sampleCount: number;
  distinctArtistCount: number;
  distinctSignalDateCount: number;
  rankCorrelation: number | null;
  directionalAccuracyPercent: number | null;
  directionalSampleCount: number;
  topBottomAudienceLift: number | null;
  averageMetricsPerSample: number;
  sourceMetricSampleCounts: Record<string, number>;
  minimumRecommendedSamples: number;
  minimumRecommendedDates: number;
  note: string;
};

type ValidationSample = {
  artistId: string;
  sourceDate: string;
  prediction: number;
  target: number;
  metricCount: number;
  sourceMetrics: string[];
};

const MINIMUM_RECOMMENDED_SAMPLES = 200;
const MINIMUM_RECOMMENDED_DATES = 21;
const DATE_TOLERANCE_DAYS = 2;

export function evaluateMarketModel({
  snapshots,
  observations,
  horizonDays = 7
}: {
  snapshots: ValidationSignalSnapshot[];
  observations: ValidationAudienceObservation[];
  horizonDays?: number;
}): MarketModelValidation {
  const safeHorizonDays = Math.max(3, Math.min(30, Math.round(horizonDays)));
  const series = buildObservationSeries(observations);
  const samples = snapshots
    .map((snapshot) => buildValidationSample(snapshot, series, safeHorizonDays))
    .filter((sample): sample is ValidationSample => Boolean(sample));
  const distinctArtistCount = new Set(samples.map((sample) => sample.artistId)).size;
  const distinctSignalDateCount = new Set(samples.map((sample) => sample.sourceDate)).size;
  const directionalSamples = samples.filter(
    (sample) => Math.abs(sample.prediction) >= 0.02 && Math.abs(sample.target) >= 0.01
  );
  const directionalMatches = directionalSamples.filter(
    (sample) => Math.sign(sample.prediction) === Math.sign(sample.target)
  ).length;
  const sourceMetricSampleCounts = samples.reduce<Record<string, number>>((counts, sample) => {
    for (const sourceMetric of sample.sourceMetrics) {
      counts[sourceMetric] = (counts[sourceMetric] ?? 0) + 1;
    }

    return counts;
  }, {});
  const status = getValidationStatus(samples.length, distinctSignalDateCount);

  return {
    status,
    horizonDays: safeHorizonDays,
    sampleCount: samples.length,
    distinctArtistCount,
    distinctSignalDateCount,
    rankCorrelation: getSpearmanCorrelation(samples),
    directionalAccuracyPercent: directionalSamples.length
      ? round((directionalMatches / directionalSamples.length) * 100, 1)
      : null,
    directionalSampleCount: directionalSamples.length,
    topBottomAudienceLift: getTopBottomLift(samples),
    averageMetricsPerSample: samples.length
      ? round(samples.reduce((total, sample) => total + sample.metricCount, 0) / samples.length, 2)
      : 0,
    sourceMetricSampleCounts,
    minimumRecommendedSamples: MINIMUM_RECOMMENDED_SAMPLES,
    minimumRecommendedDates: MINIMUM_RECOMMENDED_DATES,
    note: getValidationNote(status, samples.length, distinctSignalDateCount)
  };
}

function buildValidationSample(
  snapshot: ValidationSignalSnapshot,
  series: Map<string, ValidationAudienceObservation[]>,
  horizonDays: number
): ValidationSample | null {
  const previousTargetDate = shiftDate(snapshot.sourceDate, -horizonDays);
  const futureTargetDate = shiftDate(snapshot.sourceDate, horizonDays);
  const metricTargets: Array<{ key: string; value: number }> = [];

  for (const [key, points] of series) {
    if (!key.startsWith(`${snapshot.artistId}:`)) {
      continue;
    }

    const previous = findClosestObservation(points, previousTargetDate);
    const current = findClosestObservation(points, snapshot.sourceDate);
    const future = findClosestObservation(points, futureTargetDate);

    if (!previous || !current || !future) {
      continue;
    }

    const previousDays = getDateDistanceDays(previous.observedDate, current.observedDate);
    const futureDays = getDateDistanceDays(current.observedDate, future.observedDate);

    if (previousDays <= 0 || futureDays <= 0) {
      continue;
    }

    const previousRate = getLogGrowthRate(previous.value, current.value, previousDays);
    const futureRate = getLogGrowthRate(current.value, future.value, futureDays);

    if (previousRate === null || futureRate === null) {
      continue;
    }

    metricTargets.push({
      key: key.slice(snapshot.artistId.length + 1),
      value: (futureRate - previousRate) * horizonDays
    });
  }

  if (!metricTargets.length) {
    return null;
  }

  return {
    artistId: snapshot.artistId,
    sourceDate: snapshot.sourceDate,
    prediction: calculateSignalDelta(snapshot) * 100,
    target: median(metricTargets.map((item) => item.value)),
    metricCount: metricTargets.length,
    sourceMetrics: metricTargets.map((item) => item.key)
  };
}

function buildObservationSeries(observations: ValidationAudienceObservation[]) {
  const series = new Map<string, ValidationAudienceObservation[]>();

  for (const observation of observations) {
    if (!Number.isFinite(observation.value) || observation.value < 0 || !isValidDate(observation.observedDate)) {
      continue;
    }

    const key = `${observation.artistId}:${observation.source}:${observation.metric}`;
    const points = series.get(key) ?? [];
    points.push(observation);
    series.set(key, points);
  }

  for (const points of series.values()) {
    points.sort((first, second) => first.observedDate.localeCompare(second.observedDate));
  }

  return series;
}

function findClosestObservation(points: ValidationAudienceObservation[], targetDate: string) {
  let closest: ValidationAudienceObservation | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const point of points) {
    const distance = Math.abs(getDateDistanceDays(targetDate, point.observedDate));

    if (distance <= DATE_TOLERANCE_DAYS && distance < closestDistance) {
      closest = point;
      closestDistance = distance;
    }
  }

  return closest;
}

function getLogGrowthRate(start: number, end: number, days: number) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < 0 || days <= 0) {
    return null;
  }

  return (Math.log1p(end) - Math.log1p(start)) / days * 100;
}

function getSpearmanCorrelation(samples: ValidationSample[]) {
  if (samples.length < 3) {
    return null;
  }

  const predictionRanks = getRanks(samples.map((sample) => sample.prediction));
  const targetRanks = getRanks(samples.map((sample) => sample.target));
  const correlation = getPearsonCorrelation(predictionRanks, targetRanks);

  return correlation === null ? null : round(correlation, 3);
}

function getTopBottomLift(samples: ValidationSample[]) {
  if (samples.length < 8) {
    return null;
  }

  const sorted = [...samples].sort((first, second) => first.prediction - second.prediction);
  const quartileSize = Math.max(2, Math.floor(sorted.length / 4));
  const bottom = sorted.slice(0, quartileSize);
  const top = sorted.slice(-quartileSize);
  const lift = average(top.map((sample) => sample.target)) - average(bottom.map((sample) => sample.target));

  return round(lift, 3);
}

function getRanks(values: number[]) {
  const sorted = values
    .map((value, index) => ({ value, index }))
    .sort((first, second) => first.value - second.value);
  const ranks = new Array<number>(values.length);

  for (let start = 0; start < sorted.length;) {
    let end = start + 1;

    while (end < sorted.length && sorted[end].value === sorted[start].value) {
      end += 1;
    }

    const averageRank = (start + end - 1) / 2 + 1;

    for (let index = start; index < end; index += 1) {
      ranks[sorted[index].index] = averageRank;
    }

    start = end;
  }

  return ranks;
}

function getPearsonCorrelation(first: number[], second: number[]) {
  if (first.length !== second.length || first.length < 3) {
    return null;
  }

  const firstAverage = average(first);
  const secondAverage = average(second);
  let numerator = 0;
  let firstSquared = 0;
  let secondSquared = 0;

  for (let index = 0; index < first.length; index += 1) {
    const firstDelta = first[index] - firstAverage;
    const secondDelta = second[index] - secondAverage;
    numerator += firstDelta * secondDelta;
    firstSquared += firstDelta ** 2;
    secondSquared += secondDelta ** 2;
  }

  const denominator = Math.sqrt(firstSquared * secondSquared);
  return denominator > 0 ? numerator / denominator : null;
}

function getValidationStatus(sampleCount: number, distinctDateCount: number): MarketModelValidation["status"] {
  if (sampleCount < 50 || distinctDateCount < 7) {
    return "collecting";
  }

  if (sampleCount < MINIMUM_RECOMMENDED_SAMPLES || distinctDateCount < MINIMUM_RECOMMENDED_DATES) {
    return "provisional";
  }

  return "measured";
}

function getValidationNote(
  status: MarketModelValidation["status"],
  sampleCount: number,
  distinctDateCount: number
) {
  if (status === "collecting") {
    return `Collecting out-of-sample outcomes (${sampleCount} samples across ${distinctDateCount} signal dates). Do not claim measured predictive accuracy yet.`;
  }

  if (status === "provisional") {
    return `Early validation only. Continue collecting until at least ${MINIMUM_RECOMMENDED_SAMPLES} samples across ${MINIMUM_RECOMMENDED_DATES} signal dates.`;
  }

  return "Measured against subsequent audience-growth acceleration; review this scorecard before changing model weights.";
}

function median(values: number[]) {
  const sorted = [...values].sort((first, second) => first - second);
  const midpoint = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0
    ? (sorted[midpoint - 1] + sorted[midpoint]) / 2
    : sorted[midpoint];
}

function average(values: number[]) {
  return values.reduce((total, value) => total + value, 0) / Math.max(1, values.length);
}

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);

  return value.toISOString().slice(0, 10);
}

function getDateDistanceDays(start: string, end: string) {
  return Math.round(
    (new Date(`${end}T00:00:00.000Z`).getTime() - new Date(`${start}T00:00:00.000Z`).getTime()) /
      86_400_000
  );
}

function isValidDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime());
}

function round(value: number, digits: number) {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}
