import { NextResponse } from "next/server";
import { getSupabaseConfigStatus } from "@/lib/supabase/server";
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
    artistCount: number;
    averageMovePercent: number;
    topGainer: { artistId: string; ticker: string; dailyChangePercent: number } | null;
    topLoser: { artistId: string; ticker: string; dailyChangePercent: number } | null;
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
        runDate: body.runDate,
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

  return NextResponse.json({
    ok: true,
    dryRun,
    persisted: !dryRun,
    source,
    runDate: body.runDate ?? new Date().toISOString().slice(0, 10),
    completedBatchCount: runs.length,
    processedArtistCount: runs.reduce((total, run) => total + (run.batch?.artistCount ?? 0), 0),
    observationCount: runs.reduce((total, run) => total + (run.observationCount ?? 0), 0),
    eventCount: runs.reduce((total, run) => total + (run.eventCount ?? 0), 0),
    detectedEventCount: runs.reduce((total, run) => total + (run.detectedEventCount ?? 0), 0),
    warnings: Array.from(warnings),
    nextOffset: lastRun?.batch?.nextOffset ?? null,
    hasMore: Boolean(lastRun?.batch?.hasMore),
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
