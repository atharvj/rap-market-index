import { NextResponse } from "next/server";
import { createServiceRoleClient, getSupabaseConfigStatus } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import type { MarketUpdateSource } from "@/server/market/daily-update";

export const dynamic = "force-dynamic";

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
    artistCount: number;
    momentumArtistCount?: number;
    averageMovePercent: number;
    averageSignalDelta?: number;
    signalSourceCoverage?: Record<string, { artistCount: number; statCount: number }>;
    topGainer: { artistId: string; ticker: string; dailyChangePercent: number } | null;
    topLoser: { artistId: string; ticker: string; dailyChangePercent: number } | null;
  };
};

type MarketMove = { artistId: string; ticker: string; dailyChangePercent: number };

type BatchRunSummary = {
  runDate: string;
  source: MarketUpdateSource;
  artistCount: number;
  momentumArtistCount: number;
  averageMovePercent: number;
  averageSignalDelta: number;
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

const DEFAULT_BATCH_SIZE = 50;
const MAX_BATCH_SIZE = 100;
const MAX_BATCHES_PER_REQUEST = 10;

export async function GET() {
  return NextResponse.json({
    ok: true,
    config: getSupabaseConfigStatus(),
    endpoint: "/api/admin/market-batch-run"
  });
}

export async function POST(request: Request) {
  const secret = process.env.MARKET_UPDATE_SECRET;
  const providedSecret = request.headers.get("x-market-update-secret");
  const config = getSupabaseConfigStatus();

  if (!secret || providedSecret !== secret) {
    return NextResponse.json(
      {
        ok: false,
        error: "Missing or invalid market update secret."
      },
      { status: 401 }
    );
  }

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
  const runDate = body.runDate ?? getToday();
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
        "x-market-update-secret": secret
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
    artistLimit,
    maxBatches
  });

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
  artistLimit,
  maxBatches
}: {
  runs: DailyUpdateResponse[];
  runDate: string;
  source: MarketUpdateSource;
  artistLimit: number;
  maxBatches: number;
}): BatchRunSummary {
  const artistCount = runs.reduce((total, run) => total + getRunArtistCount(run), 0);
  const momentumArtistCount = runs.reduce((total, run) => total + (run.summary?.momentumArtistCount ?? 0), 0);
  const averageMovePercent = getWeightedAverage(runs, "averageMovePercent", artistCount);
  const averageSignalDelta = getWeightedAverage(runs, "averageSignalDelta", artistCount);
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
    artistCount,
    momentumArtistCount,
    averageMovePercent,
    averageSignalDelta,
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
  key: "averageMovePercent" | "averageSignalDelta",
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
      completed_at: new Date().toISOString(),
      summary: summary as unknown as Json,
      error_message: null
    })
    .eq("run_date", runDate);

  if (error) {
    throw new Error(`Could not save aggregate market run summary: ${error.message}`);
  }
}

function getToday() {
  return new Date().toISOString().slice(0, 10);
}
