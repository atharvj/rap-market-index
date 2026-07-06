import { clamp } from "@/lib/pricing";

export type SnapshotMomentumResult = {
  value: number | undefined;
  baselineAgeDays: number | undefined;
  baselineAgeFactor: number;
  rawChangePercent: number | undefined;
  normalizedChangePercent: number | undefined;
  confidenceMultiplier: number;
  anomalyFlags: string[];
};

export function calculateSnapshotMomentum({
  current,
  baseline,
  baselineAgeDays,
  multiplier,
  min,
  max,
  monotonic = false,
  extremeJumpPercent = 120,
  counterDropPercent = 1.5
}: {
  current: number | undefined;
  baseline: number | undefined;
  baselineAgeDays: number | undefined;
  multiplier: number;
  min: number;
  max: number;
  monotonic?: boolean;
  extremeJumpPercent?: number;
  counterDropPercent?: number;
}): SnapshotMomentumResult {
  const baselineAgeFactor = getBaselineAgeFactor(baselineAgeDays);

  if (typeof current !== "number" || typeof baseline !== "number" || baseline <= 0) {
    return {
      value: undefined,
      baselineAgeDays,
      baselineAgeFactor,
      rawChangePercent: undefined,
      normalizedChangePercent: undefined,
      confidenceMultiplier: 0.42,
      anomalyFlags: ["missing_baseline"]
    };
  }

  const rawChangePercent = ((current - baseline) / baseline) * 100;
  const normalizedChangePercent = rawChangePercent / baselineAgeFactor;
  const anomalyFlags: string[] = [];
  let adjustedChangePercent = normalizedChangePercent;
  let anomalyMultiplier = 1;

  if (monotonic && rawChangePercent < -counterDropPercent) {
    anomalyFlags.push("counter_drop");
    adjustedChangePercent = clamp(normalizedChangePercent * 0.22, -1.6, 0);
    anomalyMultiplier *= 0.55;
  }

  if (Math.abs(rawChangePercent) >= extremeJumpPercent && baselineAgeFactor <= 2) {
    anomalyFlags.push("single_run_extreme_jump");
    anomalyMultiplier *= 0.72;
  }

  return {
    value: clamp(adjustedChangePercent * multiplier, min, max),
    baselineAgeDays,
    baselineAgeFactor,
    rawChangePercent,
    normalizedChangePercent,
    confidenceMultiplier: clamp(getBaselineFreshnessMultiplier(baselineAgeDays) * anomalyMultiplier, 0.22, 1),
    anomalyFlags
  };
}

export function calculatePointDeltaMomentum({
  current,
  baseline,
  baselineAgeDays,
  multiplier,
  min,
  max,
  extremeJumpPoints = 25
}: {
  current: number | undefined;
  baseline: number | undefined;
  baselineAgeDays: number | undefined;
  multiplier: number;
  min: number;
  max: number;
  extremeJumpPoints?: number;
}): SnapshotMomentumResult {
  const baselineAgeFactor = getBaselineAgeFactor(baselineAgeDays);

  if (typeof current !== "number" || typeof baseline !== "number") {
    return {
      value: undefined,
      baselineAgeDays,
      baselineAgeFactor,
      rawChangePercent: undefined,
      normalizedChangePercent: undefined,
      confidenceMultiplier: 0.42,
      anomalyFlags: ["missing_baseline"]
    };
  }

  const rawPointChange = current - baseline;
  const normalizedPointChange = rawPointChange / baselineAgeFactor;
  const anomalyFlags = Math.abs(rawPointChange) >= extremeJumpPoints && baselineAgeFactor <= 2
    ? ["single_run_extreme_jump"]
    : [];
  const anomalyMultiplier = anomalyFlags.length ? 0.76 : 1;

  return {
    value: clamp(normalizedPointChange * multiplier, min, max),
    baselineAgeDays,
    baselineAgeFactor,
    rawChangePercent: rawPointChange,
    normalizedChangePercent: normalizedPointChange,
    confidenceMultiplier: clamp(getBaselineFreshnessMultiplier(baselineAgeDays) * anomalyMultiplier, 0.22, 1),
    anomalyFlags
  };
}

export function getBaselineAgeDays(baseline: Record<string, number>, metric: string) {
  const value = baseline[`${metric}__age_days`];

  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function getBaselineAgeFactor(value: number | undefined) {
  return Math.max(1, Math.min(30, value ?? 1));
}

export function getCombinedConfidenceMultiplier(results: SnapshotMomentumResult[]) {
  const validResults = results.filter((result) => typeof result.value === "number");

  if (!validResults.length) {
    return 0.42;
  }

  return clamp(
    validResults.reduce((total, result) => total + result.confidenceMultiplier, 0) / validResults.length,
    0.22,
    1
  );
}

export function buildMomentumQualityPayload(result: SnapshotMomentumResult) {
  return {
    rawChangePercent: round(result.rawChangePercent),
    normalizedChangePercent: round(result.normalizedChangePercent),
    baselineAgeDays: result.baselineAgeDays ?? null,
    baselineAgeFactor: result.baselineAgeFactor,
    confidenceMultiplier: round(result.confidenceMultiplier),
    anomalyFlags: result.anomalyFlags
  };
}

function getBaselineFreshnessMultiplier(ageDays: number | undefined) {
  if (typeof ageDays !== "number") {
    return 0.42;
  }

  if (ageDays <= 3) {
    return 1;
  }

  if (ageDays <= 7) {
    return 0.94;
  }

  if (ageDays <= 14) {
    return 0.84;
  }

  if (ageDays <= 30) {
    return 0.72;
  }

  return 0.58;
}

function round(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value * 1000) / 1000 : null;
}
