import { NextResponse } from "next/server";
import { createServiceRoleClient, getSupabaseConfigStatus } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import { requireAdminRequest } from "@/server/admin-auth";
import type { MarketUpdateSource } from "@/server/market/daily-update";
import { getPacificMarketDate } from "@/server/market/market-date";
import { getMarketModelVersion } from "@/server/market/model-version";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type MarketBatchRunBody = {
  dryRun?: boolean;
  source?: MarketUpdateSource;
  runDate?: string;
  artistLimit?: number;
  artistOffset?: number;
  maxBatches?: number;
};

type DailyUpdateResponse = {
  ok: boolean;
  error?: string;
  dryRun?: boolean;
  persisted?: boolean;
  observationCount?: number;
  eventCount?: number;
  detectedEventCount?: number;
  submittedEventCount?: number;
  warnings?: string[];
  batch?: {
    offset: number;
    limit: number | null;
    artistCount: number;
    totalArtists: number;
    nextOffset: number | null;
    hasMore: boolean;
  };
  summary?: {
    runDate?: string;
    source?: MarketUpdateSource;
    modelVersion?: string;
    artistCount: number;
    momentumArtistCount?: number;
    averageMovePercent: number;
    averageAbsMovePercent?: number;
    averageSignalDelta?: number;
    upMoveCount?: number;
    downMoveCount?: number;
    flatMoveCount?: number;
    lowReliabilityCount?: number;
    mediumReliabilityCount?: number;
    highReliabilityCount?: number;
    sourceQualityAnomalyCount?: number;
    sourceQualityStaleCount?: number;
    averageSourceQualityMultiplier?: number;
    technicalAdjustmentCount?: number;
    averageTechnicalAdjustment?: number;
    catalystArtistCount?: number;
    highPriorityCatalystArtistCount?: number;
    mixedCatalystArtistCount?: number;
    averageNetCatalystShock?: number;
    averageAbsCatalystShock?: number;
    sourceConflictArtistCount?: number;
    averageSourceDirectionSpread?: number;
    averageSourceCount?: number;
    signalCoverageScore?: number;
    reliabilityScore?: number;
    movementBalanceScore?: number;
    marketQualityScore?: number;
    signalSourceCoverage?: Record<string, { artistCount: number; statCount: number }>;
    topGainer: { artistId: string; ticker: string; dailyChangePercent: number } | null;
    topLoser: { artistId: string; ticker: string; dailyChangePercent: number } | null;
  };
};

type MarketMove = { artistId: string; ticker: string; dailyChangePercent: number };

type BatchRunSummary = {
  runDate: string;
  source: MarketUpdateSource;
  modelVersion: string;
  artistCount: number;
  momentumArtistCount: number;
  averageMovePercent: number;
  averageAbsMovePercent: number;
  averageSignalDelta: number;
  upMoveCount: number;
  downMoveCount: number;
  flatMoveCount: number;
  lowReliabilityCount: number;
  mediumReliabilityCount: number;
  highReliabilityCount: number;
  sourceQualityAnomalyCount: number;
  sourceQualityStaleCount: number;
  averageSourceQualityMultiplier: number;
  technicalAdjustmentCount: number;
  averageTechnicalAdjustment: number;
  catalystArtistCount: number;
  highPriorityCatalystArtistCount: number;
  mixedCatalystArtistCount: number;
  averageNetCatalystShock: number;
  averageAbsCatalystShock: number;
  sourceConflictArtistCount: number;
  averageSourceDirectionSpread: number;
  averageSourceCount: number;
  signalCoverageScore: number;
  reliabilityScore: number;
  movementBalanceScore: number;
  marketQualityScore: number;
  signalSourceCoverage: Record<string, { artistCount: number; statCount: number }>;
  topGainer: MarketMove | null;
  topLoser: MarketMove | null;
  batch: {
    completedBatchCount: number;
    requestedBatchSize: number;
    requestedMaxBatches: number;
    processedArtistCount: number;
    nextOffset: number | null;
    hasMore: boolean;
  };
};

const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 100;
const MAX_BATCHES_PER_REQUEST = 10;

export async function GET(request: Request) {
  const auth = await requireAdminRequest(request);

  if (!auth.ok) {
    return auth.response;
  }

  return NextResponse.json({
    ok: true,
    config: getSupabaseConfigStatus(),
    endpoint: "/api/admin/market-batch-run"
  });
}

export async function POST(request: Request) {
  const auth = await requireAdminRequest(request, { allowMarketSecret: true });

  if (!auth.ok) {
    return auth.response;
  }

  const providedSecret = request.headers.get("x-market-update-secret");
  const config = getSupabaseConfigStatus();

  if (!config.readyForAdminWrites) {
    return NextResponse.json(
      {
        ok: false,
        error: "Supabase admin credentials are not fully configured.",
        config
      },
      { status: 400 }
    );
  }

  const body = await parseBody(request);
  const source = normalizeSource(body.source);
  const dryRun = body.dryRun !== false;
  const runDate = body.runDate ?? getPacificMarketDate();
  const modelVersion = getMarketModelVersion();
  const artistLimit = normalizePositiveInteger(body.artistLimit, DEFAULT_BATCH_SIZE, MAX_BATCH_SIZE);
  const maxBatches = normalizePositiveInteger(body.maxBatches, 1, MAX_BATCHES_PER_REQUEST);
  let artistOffset = normalizePositiveInteger(body.artistOffset, 0, Number.MAX_SAFE_INTEGER);
  const runs: DailyUpdateResponse[] = [];
  const warnings = new Set<string>();

  for (let index = 0; index < maxBatches; index += 1) {
    const response = await fetch(new URL("/api/admin/daily-market-update", request.url), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(providedSecret ? { "x-market-update-secret": providedSecret } : {}),
        ...(auth.source === "admin-email" && request.headers.get("authorization")
          ? { authorization: request.headers.get("authorization") as string }
          : {})
      },
      body: JSON.stringify({
        dryRun,
        source,
        runDate,
        artistLimit,
        artistOffset
      })
    });
    const payload = (await response.json()) as DailyUpdateResponse;

    runs.push(payload);
    payload.warnings?.forEach((warning) => warnings.add(warning));

    if (!response.ok || !payload.ok) {
      if (!dryRun) {
        await persistBatchRunFailure({
          runDate,
          modelVersion,
          errorMessage: payload.error ?? "Market batch update failed.",
          runs
        });
      }

      return NextResponse.json(
        {
          ok: false,
          dryRun,
          source,
          error: payload.error ?? "Market batch update failed.",
          completedBatchCount: runs.length - 1,
          runs
        },
        { status: response.status || 500 }
      );
    }

    if (!payload.batch?.hasMore || payload.batch.nextOffset === null) {
      break;
    }

    artistOffset = payload.batch.nextOffset;
  }

  const lastRun = runs[runs.length - 1];
  const summary = buildBatchRunSummary({
    runs,
    runDate,
    source,
    modelVersion,
    artistLimit,
    maxBatches
  });
  const incomplete = Boolean(lastRun?.batch?.hasMore);

  if (incomplete) {
    const errorMessage = `Market run stopped after ${runs.length} batch${runs.length === 1 ? "" : "es"} with ${summary.batch.processedArtistCount} of ${lastRun?.batch?.totalArtists ?? "unknown"} artists processed.`;

    if (!dryRun) {
      await persistBatchRunFailure({
        runDate,
        modelVersion,
        errorMessage,
        runs,
        summary
      });
    }

    return NextResponse.json(
      {
        ok: false,
        dryRun,
        persisted: false,
        source,
        runDate,
        error: errorMessage,
        completedBatchCount: runs.length,
        processedArtistCount: summary.batch.processedArtistCount,
        nextOffset: summary.batch.nextOffset,
        hasMore: true,
        summary,
        runs
      },
      { status: 503 }
    );
  }

  if (!dryRun) {
    await persistBatchRunSummary(runDate, summary);
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    persisted: !dryRun,
    source,
    runDate,
    completedBatchCount: runs.length,
    processedArtistCount: runs.reduce((total, run) => total + (run.batch?.artistCount ?? 0), 0),
    observationCount: runs.reduce((total, run) => total + (run.observationCount ?? 0), 0),
    eventCount: runs.reduce((total, run) => total + (run.eventCount ?? 0), 0),
    detectedEventCount: runs.reduce((total, run) => total + (run.detectedEventCount ?? 0), 0),
    warnings: Array.from(warnings),
    nextOffset: lastRun?.batch?.nextOffset ?? null,
    hasMore: Boolean(lastRun?.batch?.hasMore),
    summary,
    runs
  });
}

async function parseBody(request: Request): Promise<MarketBatchRunBody> {
  try {
    return (await request.json()) as MarketBatchRunBody;
  } catch {
    return {};
  }
}

function normalizeSource(source: MarketBatchRunBody["source"]): MarketUpdateSource {
  if (
    source === "manual" ||
    source === "gdelt" ||
    source === "lastfm" ||
    source === "spotify" ||
    source === "youtube" ||
    source === "wikimedia" ||
    source === "reddit" ||
    source === "bluesky" ||
    source === "core" ||
    source === "blended"
  ) {
    return source;
  }

  return "lastfm";
}

function normalizePositiveInteger(value: unknown, fallback: number, max: number) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return fallback;
  }

  return Math.min(value, max);
}

function buildBatchRunSummary({
  runs,
  runDate,
  source,
  modelVersion,
  artistLimit,
  maxBatches
}: {
  runs: DailyUpdateResponse[];
  runDate: string;
  source: MarketUpdateSource;
  modelVersion: string;
  artistLimit: number;
  maxBatches: number;
}): BatchRunSummary {
  const artistCount = runs.reduce((total, run) => total + getRunArtistCount(run), 0);
  const momentumArtistCount = runs.reduce((total, run) => total + (run.summary?.momentumArtistCount ?? 0), 0);
  const averageMovePercent = getWeightedAverage(runs, "averageMovePercent", artistCount);
  const averageAbsMovePercent = getWeightedAverage(runs, "averageAbsMovePercent", artistCount);
  const averageSignalDelta = getWeightedAverage(runs, "averageSignalDelta", artistCount);
  const upMoveCount = runs.reduce((total, run) => total + (run.summary?.upMoveCount ?? 0), 0);
  const downMoveCount = runs.reduce((total, run) => total + (run.summary?.downMoveCount ?? 0), 0);
  const flatMoveCount = runs.reduce((total, run) => total + (run.summary?.flatMoveCount ?? 0), 0);
  const lowReliabilityCount = runs.reduce((total, run) => total + (run.summary?.lowReliabilityCount ?? 0), 0);
  const mediumReliabilityCount = runs.reduce((total, run) => total + (run.summary?.mediumReliabilityCount ?? 0), 0);
  const highReliabilityCount = runs.reduce((total, run) => total + (run.summary?.highReliabilityCount ?? 0), 0);
  const sourceQualityAnomalyCount = runs.reduce(
    (total, run) => total + (run.summary?.sourceQualityAnomalyCount ?? 0),
    0
  );
  const sourceQualityStaleCount = runs.reduce(
    (total, run) => total + (run.summary?.sourceQualityStaleCount ?? 0),
    0
  );
  const averageSourceQualityMultiplier = getWeightedAverage(runs, "averageSourceQualityMultiplier", artistCount);
  const technicalAdjustmentCount = runs.reduce((total, run) => total + (run.summary?.technicalAdjustmentCount ?? 0), 0);
  const averageTechnicalAdjustment = getWeightedAverage(runs, "averageTechnicalAdjustment", artistCount);
  const catalystArtistCount = runs.reduce((total, run) => total + (run.summary?.catalystArtistCount ?? 0), 0);
  const highPriorityCatalystArtistCount = runs.reduce(
    (total, run) => total + (run.summary?.highPriorityCatalystArtistCount ?? 0),
    0
  );
  const mixedCatalystArtistCount = runs.reduce((total, run) => total + (run.summary?.mixedCatalystArtistCount ?? 0), 0);
  const averageNetCatalystShock = getWeightedAverage(runs, "averageNetCatalystShock", artistCount);
  const averageAbsCatalystShock = getWeightedAverage(runs, "averageAbsCatalystShock", artistCount);
  const sourceConflictArtistCount = runs.reduce(
    (total, run) => total + (run.summary?.sourceConflictArtistCount ?? 0),
    0
  );
  const averageSourceDirectionSpread = getWeightedAverage(runs, "averageSourceDirectionSpread", artistCount);
  const averageSourceCount = getWeightedAverage(runs, "averageSourceCount", artistCount);
  const signalCoverageScore = getWeightedAverage(runs, "signalCoverageScore", artistCount);
  const reliabilityScore = getWeightedAverage(runs, "reliabilityScore", artistCount);
  const movementBalanceScore = getWeightedAverage(runs, "movementBalanceScore", artistCount);
  const marketQualityScore = getWeightedAverage(runs, "marketQualityScore", artistCount);
  const topGainer = runs
    .map((run) => run.summary?.topGainer)
    .filter(isMarketMove)
    .sort((a, b) => b.dailyChangePercent - a.dailyChangePercent)[0] ?? null;
  const topLoser = runs
    .map((run) => run.summary?.topLoser)
    .filter(isMarketMove)
    .sort((a, b) => a.dailyChangePercent - b.dailyChangePercent)[0] ?? null;
  const lastRun = runs[runs.length - 1];

  return {
    runDate,
    source,
    modelVersion,
    artistCount,
    momentumArtistCount,
    averageMovePercent,
    averageAbsMovePercent,
    averageSignalDelta,
    upMoveCount,
    downMoveCount,
    flatMoveCount,
    lowReliabilityCount,
    mediumReliabilityCount,
    highReliabilityCount,
    sourceQualityAnomalyCount,
    sourceQualityStaleCount,
    averageSourceQualityMultiplier,
    technicalAdjustmentCount,
    averageTechnicalAdjustment,
    catalystArtistCount,
    highPriorityCatalystArtistCount,
    mixedCatalystArtistCount,
    averageNetCatalystShock,
    averageAbsCatalystShock,
    sourceConflictArtistCount,
    averageSourceDirectionSpread,
    averageSourceCount,
    signalCoverageScore,
    reliabilityScore,
    movementBalanceScore,
    marketQualityScore,
    signalSourceCoverage: mergeSignalSourceCoverage(runs),
    topGainer,
    topLoser,
    batch: {
      completedBatchCount: runs.length,
      requestedBatchSize: artistLimit,
      requestedMaxBatches: maxBatches,
      processedArtistCount: artistCount,
      nextOffset: lastRun?.batch?.nextOffset ?? null,
      hasMore: Boolean(lastRun?.batch?.hasMore)
    }
  };
}

function isMarketMove(move: MarketMove | null | undefined): move is MarketMove {
  return Boolean(move);
}

function getRunArtistCount(run: DailyUpdateResponse) {
  return run.summary?.artistCount ?? run.batch?.artistCount ?? 0;
}

function getWeightedAverage(
  runs: DailyUpdateResponse[],
  key:
    | "averageMovePercent"
    | "averageAbsMovePercent"
    | "averageSignalDelta"
    | "averageSourceQualityMultiplier"
    | "averageTechnicalAdjustment"
    | "averageNetCatalystShock"
    | "averageAbsCatalystShock"
    | "averageSourceDirectionSpread"
    | "averageSourceCount"
    | "signalCoverageScore"
    | "reliabilityScore"
    | "movementBalanceScore"
    | "marketQualityScore",
  artistCount: number
) {
  if (artistCount <= 0) {
    return 0;
  }

  return (
    runs.reduce((total, run) => {
      const value = run.summary?.[key] ?? 0;

      return total + value * getRunArtistCount(run);
    }, 0) / artistCount
  );
}

function mergeSignalSourceCoverage(runs: DailyUpdateResponse[]) {
  const coverage: Record<string, { artistCount: number; statCount: number }> = {};

  for (const run of runs) {
    for (const [source, value] of Object.entries(run.summary?.signalSourceCoverage ?? {})) {
      coverage[source] ??= { artistCount: 0, statCount: 0 };
      coverage[source].artistCount += value.artistCount;
      coverage[source].statCount += value.statCount;
    }
  }

  return coverage;
}

async function persistBatchRunSummary(runDate: string, summary: BatchRunSummary) {
  const { error } = await createServiceRoleClient()
    .from("market_update_runs")
    .update({
      status: "succeeded",
      model_version: summary.modelVersion,
      completed_at: new Date().toISOString(),
      summary: summary as unknown as Json,
      error_message: null
    })
    .eq("run_date", runDate);

  if (error) {
    throw new Error(`Could not save aggregate market run summary: ${error.message}`);
  }
}

async function persistBatchRunFailure({
  runDate,
  modelVersion,
  errorMessage,
  runs,
  summary
}: {
  runDate: string;
  modelVersion: string;
  errorMessage: string;
  runs: DailyUpdateResponse[];
  summary?: BatchRunSummary;
}) {
  const partialSummary = summary ?? {
    completedBatchCount: runs.length,
    processedArtistCount: runs.reduce((total, run) => total + (run.batch?.artistCount ?? 0), 0)
  };
  const { error } = await createServiceRoleClient()
    .from("market_update_runs")
    .update({
      status: "failed",
      model_version: modelVersion,
      completed_at: new Date().toISOString(),
      summary: partialSummary as unknown as Json,
      error_message: errorMessage
    })
    .eq("run_date", runDate);

  if (error) {
    throw new Error(`Could not save failed aggregate market run: ${error.message}`);
  }
}
