import { NextResponse } from "next/server";
import { getSupabaseConfigStatus } from "@/lib/supabase/server";
import { requireAdminRequest } from "@/server/admin-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type MarketRunNowBody = {
  force?: boolean;
  runDate?: string;
  dryRun?: boolean;
  artistLimit?: number;
  artistOffset?: number;
  maxBatches?: number;
  eventScanLimit?: number;
  eventScanMaxRecords?: number;
};

type MarketEventScanResponse = {
  ok: boolean;
  error?: string;
  dryRun?: boolean;
  persisted?: boolean;
  runDate?: string;
  scannedArtistCount?: number;
  observationCount?: number;
  eventCount?: number;
  gdeltEventCount?: number;
  mediaRssEventCount?: number;
  aiResearchEnabled?: boolean;
  aiResearchEventCount?: number;
  mediaRssScannedFeedCount?: number;
  warnings?: string[];
  eventTypeCounts?: Record<string, number>;
};

type MarketBatchRunResponse = {
  ok: boolean;
  error?: string;
  dryRun?: boolean;
  persisted?: boolean;
  completedBatchCount?: number;
  processedArtistCount?: number;
  observationCount?: number;
  eventCount?: number;
  detectedEventCount?: number;
  warnings?: string[];
  nextOffset?: number | null;
  hasMore?: boolean;
  runDate?: string;
  source?: string;
  summary?: {
    artistCount?: number;
    momentumArtistCount?: number;
    averageMovePercent?: number;
    averageSignalDelta?: number;
    modelVersion?: string;
    topGainer?: { ticker: string; dailyChangePercent: number } | null;
    topLoser?: { ticker: string; dailyChangePercent: number } | null;
    batch?: {
      completedBatchCount?: number;
      processedArtistCount?: number;
      hasMore?: boolean;
      nextOffset?: number | null;
    };
  };
};

const DEFAULT_RUN_NOW_ARTIST_LIMIT = 10;
const DEFAULT_RUN_NOW_MAX_BATCHES = 1;
const DEFAULT_RUN_NOW_EVENT_SCAN_LIMIT = 20;
const DEFAULT_RUN_NOW_EVENT_SCAN_MAX_RECORDS = 12;

export async function POST(request: Request) {
  const auth = await requireAdminRequest(request, { allowMarketSecret: false });

  if (!auth.ok) {
    return auth.response;
  }

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

  const marketSecret = process.env.MARKET_UPDATE_SECRET?.trim();

  if (!marketSecret) {
    return NextResponse.json(
      {
        ok: false,
        error: "MARKET_UPDATE_SECRET is not configured."
      },
      { status: 500 }
    );
  }

  const body = await parseBody(request);
  const dryRun = body.dryRun === true;
  const force = body.force !== false;
  const runDate = body.runDate && /^\d{4}-\d{2}-\d{2}$/.test(body.runDate) ? body.runDate : undefined;
  const artistLimit = normalizeInteger(body.artistLimit, DEFAULT_RUN_NOW_ARTIST_LIMIT, 1, 25);
  const artistOffset = normalizeInteger(body.artistOffset, 0, 0, Number.MAX_SAFE_INTEGER);
  const maxBatches = normalizeInteger(body.maxBatches, DEFAULT_RUN_NOW_MAX_BATCHES, 1, 2);
  const eventScanLimit = normalizeInteger(body.eventScanLimit, DEFAULT_RUN_NOW_EVENT_SCAN_LIMIT, 0, 20);
  const eventScanMaxRecords = normalizeInteger(
    body.eventScanMaxRecords,
    DEFAULT_RUN_NOW_EVENT_SCAN_MAX_RECORDS,
    1,
    25
  );
  const eventScan = await runEventScan({
    request,
    marketSecret,
    dryRun,
    runDate,
    artistLimit: eventScanLimit,
    maxRecords: eventScanMaxRecords
  });
  const response = await fetch(new URL("/api/admin/market-batch-run", request.url), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-market-update-secret": marketSecret
    },
    body: JSON.stringify({
      dryRun,
      source: "core",
      runDate,
      artistLimit,
      artistOffset,
      maxBatches
    })
  });
  const payload = await readJsonResponse<MarketBatchRunResponse>(response);

  if (!response.ok || !payload.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: payload.error ?? "Market run failed.",
        eventScan,
        payload
      },
      { status: response.status || 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    forced: force,
    dryRun,
    persisted: Boolean(payload.persisted),
    runDate: payload.runDate ?? null,
    source: payload.source ?? null,
    artistLimit,
    artistOffset,
    eventScan,
    result: payload
  });
}

async function runEventScan({
  request,
  marketSecret,
  dryRun,
  runDate,
  artistLimit,
  maxRecords
}: {
  request: Request;
  marketSecret: string;
  dryRun: boolean;
  runDate?: string;
  artistLimit: number;
  maxRecords: number;
}): Promise<
  | {
      ok: true;
      disabled: true;
      reason: string;
    }
  | {
      ok: boolean;
      disabled?: false;
      error?: string;
      payload?: MarketEventScanResponse;
    }
> {
  if (artistLimit <= 0) {
    return {
      ok: true,
      disabled: true,
      reason: "eventScanLimit is 0."
    };
  }

  const response = await fetch(new URL("/api/admin/market-event-scan", request.url), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-market-update-secret": marketSecret
    },
    body: JSON.stringify({
      dryRun,
      runDate,
      artistLimit,
      maxRecords
    })
  });
  const payload = await readJsonResponse<MarketEventScanResponse>(response);

  return {
    ok: response.ok && payload.ok,
    error: response.ok && payload.ok ? undefined : payload.error ?? "Market event scan failed.",
    payload
  };
}

async function parseBody(request: Request): Promise<MarketRunNowBody> {
  try {
    return (await request.json()) as MarketRunNowBody;
  } catch {
    return {};
  }
}

async function readJsonResponse<T extends { ok?: boolean; error?: string }>(response: Response): Promise<T> {
  const text = await response.text();

  if (!text.trim()) {
    return {
      ok: false,
      error: `Market batch returned an empty response with HTTP ${response.status}.`
    } as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return {
      ok: false,
      error: text.slice(0, 240) || `Market batch returned non-JSON with HTTP ${response.status}.`
    } as T;
  }
}

function normalizeInteger(value: unknown, fallback: number, min: number, max: number) {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, value));
}
