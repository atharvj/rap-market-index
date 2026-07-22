import { NextResponse } from "next/server";
import { createServiceRoleClient, getSupabaseConfigStatus } from "@/lib/supabase/server";
import { deleteExpiredAccountRecreationCooldowns } from "@/server/account-recreation";
import type { MarketUpdateSource } from "@/server/market/daily-update";
import { getPacificMarketDate } from "@/server/market/market-date";
import { enforceRateLimit, getRequestIp } from "@/server/rate-limit";
import { secureCompare } from "@/server/secrets";
import {
  getMarketRunSkipDecision,
  type ExistingMarketRun,
  type MarketRunCoverage
} from "@/server/market/run-guard";

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

const DEFAULT_SOURCE: MarketUpdateSource = "core";
const DEFAULT_ARTIST_LIMIT = 100;
const DEFAULT_MAX_BATCHES = 1;

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

  const limited = await enforceRateLimit({
    request,
    identifier: getRequestIp(request),
    scope: "market-cron",
    limit: 30,
    windowSeconds: 3600
  });

  if (limited) {
    return limited;
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
  const runDate = normalizeDate(url.searchParams.get("runDate")) ?? getPacificMarketDate();
  const source = normalizeSource(process.env.MARKET_CRON_SOURCE);
  const artistLimit = getInteger(process.env.MARKET_CRON_ARTIST_LIMIT, DEFAULT_ARTIST_LIMIT, 1, 100);
  const maxBatches = getInteger(process.env.MARKET_CRON_MAX_BATCHES, DEFAULT_MAX_BATCHES, 1, 10);
  const accountCooldownCleanup = await runAccountCooldownCleanup();
  const existing = await loadExistingRun(runDate);
  const coverage = await loadRunCoverage(runDate);

  if (!dryRun && !force && existing) {
    const decision = getMarketRunSkipDecision({
      run: existing,
      source,
      coverage
    });

    if (decision.skip) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: decision.reason,
        runDate,
        source,
        accountCooldownCleanup,
        coverage,
        existing
      });
    }
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

  const eventScan = {
    ok: true,
    disabled: true,
    reason: "Market news is refreshed by the dedicated six-hour news scheduler."
  } as const;

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
        eventScan,
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
    coverageBeforeRun: coverage,
    accountCooldownCleanup,
    eventScan,
    result: payload
  });
}

async function runAccountCooldownCleanup() {
  try {
    const removedCount = await deleteExpiredAccountRecreationCooldowns({
      supabase: createServiceRoleClient()
    });

    return { ok: true, removedCount };
  } catch {
    return { ok: false, removedCount: 0 };
  }
}

function validateCronRequest(request: Request): { ok: true } | { ok: false; error: string } {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const marketSecret = process.env.MARKET_UPDATE_SECRET;

  if (secureCompare(authHeader, cronSecret ? `Bearer ${cronSecret}` : null)) {
    return { ok: true };
  }

  if (
    marketSecret &&
    (secureCompare(request.headers.get("x-market-update-secret"), marketSecret)
      || secureCompare(authHeader, `Bearer ${marketSecret}`))
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

async function loadExistingRun(runDate: string): Promise<ExistingMarketRun | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("market_update_runs")
    .select("run_date,status,source,started_at,completed_at,summary,error_message")
    .eq("run_date", runDate)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not check existing market run: ${error.message}`);
  }

  return (data ?? null) as ExistingMarketRun | null;
}

async function loadRunCoverage(runDate: string): Promise<MarketRunCoverage> {
  const supabase = createServiceRoleClient();
  const { data: artists, error: artistsError } = await supabase
    .from("artists")
    .select("id")
    .eq("is_active", true);

  if (artistsError) {
    throw new Error(`Could not count active artists for market recovery: ${artistsError.message}`);
  }

  const artistIds = (artists ?? []).map((artist) => artist.id);

  if (!artistIds.length) {
    return {
      activeArtistCount: 0,
      completedArtistCount: 0
    };
  }

  const { data: history, error: historyError } = await supabase
    .from("price_history")
    .select("artist_id")
    .eq("price_date", runDate)
    .in("artist_id", artistIds);

  if (historyError) {
    throw new Error(`Could not inspect market close coverage: ${historyError.message}`);
  }

  return {
    activeArtistCount: artistIds.length,
    completedArtistCount: new Set((history ?? []).map((row) => row.artist_id)).size
  };
}

function normalizeSource(value: string | undefined): MarketUpdateSource {
  if (
    value === "gdelt" ||
    value === "lastfm" ||
    value === "spotify" ||
    value === "youtube" ||
    value === "wikimedia" ||
    value === "reddit" ||
    value === "bluesky" ||
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

function getInteger(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = value ? Number(value) : fallback;

  if (!Number.isInteger(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}
