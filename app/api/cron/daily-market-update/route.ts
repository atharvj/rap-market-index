import { NextResponse } from "next/server";
import { createServiceRoleClient, getSupabaseConfigStatus } from "@/lib/supabase/server";
import type { MarketUpdateSource } from "@/server/market/daily-update";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type MarketBatchRunResponse = {
  ok: boolean;
  error?: string;
  dryRun?: boolean;
  persisted?: boolean;
  source?: string;
  runDate?: string;
  completedBatchCount?: number;
  processedArtistCount?: number;
  observationCount?: number;
  eventCount?: number;
  detectedEventCount?: number;
  warnings?: string[];
  nextOffset?: number | null;
  hasMore?: boolean;
};

type ExistingRun = {
  run_date: string;
  status: "running" | "succeeded" | "failed";
  source: string;
  started_at: string;
  completed_at: string | null;
  summary: unknown;
  error_message: string | null;
};

const DEFAULT_SOURCE: MarketUpdateSource = "core";
const DEFAULT_ARTIST_LIMIT = 25;
const DEFAULT_MAX_BATCHES = 4;

export async function GET(request: Request) {
  const auth = validateCronRequest(request);

  if (!auth.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: auth.error
      },
      { status: 401 }
    );
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

  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1";
  const dryRun = url.searchParams.get("dryRun") === "1";
  const runDate = normalizeDate(url.searchParams.get("runDate")) ?? getPacificDate();
  const source = normalizeSource(process.env.MARKET_CRON_SOURCE);
  const artistLimit = getInteger(process.env.MARKET_CRON_ARTIST_LIMIT, DEFAULT_ARTIST_LIMIT, 1, 100);
  const maxBatches = getInteger(process.env.MARKET_CRON_MAX_BATCHES, DEFAULT_MAX_BATCHES, 1, 10);
  const existing = await loadExistingRun(runDate);

  if (!dryRun && !force && existing && shouldSkipExistingRun(existing, source)) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: `A ${source} market update is already ${existing.status} for ${runDate}.`,
      runDate,
      source,
      existing
    });
  }

  const secret = process.env.MARKET_UPDATE_SECRET;

  if (!secret) {
    return NextResponse.json(
      {
        ok: false,
        error: "MARKET_UPDATE_SECRET is not configured."
      },
      { status: 500 }
    );
  }

  const response = await fetch(new URL("/api/admin/market-batch-run", request.url), {
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
      artistOffset: 0,
      maxBatches
    })
  });
  const payload = (await response.json()) as MarketBatchRunResponse;

  if (!response.ok || !payload.ok) {
    return NextResponse.json(
      {
        ok: false,
        runDate,
        source,
        artistLimit,
        maxBatches,
        error: payload.error ?? "Scheduled market update failed.",
        payload
      },
      { status: response.status || 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    runDate,
    source,
    artistLimit,
    maxBatches,
    result: payload
  });
}

function validateCronRequest(request: Request): { ok: true } | { ok: false; error: string } {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const marketSecret = process.env.MARKET_UPDATE_SECRET;

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return { ok: true };
  }

  if (
    marketSecret &&
    (request.headers.get("x-market-update-secret") === marketSecret || authHeader === `Bearer ${marketSecret}`)
  ) {
    return { ok: true };
  }

  if (!cronSecret) {
    return {
      ok: false,
      error: "CRON_SECRET is not configured. Add it to the production environment before enabling cron."
    };
  }

  return {
    ok: false,
    error: "Missing or invalid cron authorization."
  };
}

async function loadExistingRun(runDate: string): Promise<ExistingRun | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("market_update_runs")
    .select("run_date,status,source,started_at,completed_at,summary,error_message")
    .eq("run_date", runDate)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not check existing market run: ${error.message}`);
  }

  return (data ?? null) as ExistingRun | null;
}

function shouldSkipExistingRun(run: ExistingRun, source: MarketUpdateSource) {
  if (run.source !== source) {
    return false;
  }

  return run.status === "succeeded" || run.status === "running";
}

function normalizeSource(value: string | undefined): MarketUpdateSource {
  if (
    value === "gdelt" ||
    value === "lastfm" ||
    value === "spotify" ||
    value === "youtube" ||
    value === "core" ||
    value === "blended"
  ) {
    return value;
  }

  return DEFAULT_SOURCE;
}

function normalizeDate(value: string | null) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function getPacificDate() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day}`;
}

function getInteger(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = value ? Number(value) : fallback;

  if (!Number.isInteger(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}
