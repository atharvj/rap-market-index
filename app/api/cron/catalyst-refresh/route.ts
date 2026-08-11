import { NextResponse } from "next/server";
import { createServiceRoleClient, getSupabaseConfigStatus } from "@/lib/supabase/server";
import { getMarketDate } from "@/server/market/market-date";
import {
  isPendingCatalyst,
  PENDING_CATALYST_MIN_CONFIDENCE,
  PENDING_CATALYST_MIN_IMPACT
} from "@/server/market/pending-catalyst";
import { enforceRateLimit, getRequestIp } from "@/server/rate-limit";
import { secureCompare } from "@/server/secrets";
import { isStoredMarketEventSourceIntegrityValid } from "@/server/market/event-integrity";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type AutomationResponse = {
  ok?: boolean;
  error?: string;
  [key: string]: unknown;
};

type CandidateEvent = {
  artist_id: string;
  title: string;
  source_url: string | null;
  raw_payload: unknown;
  event_date: string;
  event_type: string;
  created_at: string;
};

const MAX_INTRADAY_ARTISTS = 25;
const RECENT_DETECTION_WINDOW_HOURS = 48;
const FAST_SCAN_ARTIST_CAP = 100;
const FAST_SCAN_RATE_LIMIT_PER_HOUR = 20;

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Missing or invalid cron authorization." }, { status: 401 });
  }

  const limited = await enforceRateLimit({
    request,
    identifier: getRequestIp(request),
    scope: "catalyst-refresh-cron",
    limit: FAST_SCAN_RATE_LIMIT_PER_HOUR,
    windowSeconds: 3600
  });

  if (limited) {
    return limited;
  }

  const config = getSupabaseConfigStatus();

  if (!config.readyForAdminWrites) {
    return NextResponse.json(
      { ok: false, error: "Catalyst refresh is not fully configured.", config },
      { status: 503 }
    );
  }

  const secret = process.env.MARKET_UPDATE_SECRET?.trim();

  if (!secret) {
    return NextResponse.json({ ok: false, error: "MARKET_UPDATE_SECRET is not configured." }, { status: 500 });
  }

  const runDate = getMarketDate();
  const eventScanResponse = await fetch(new URL("/api/admin/market-event-scan", request.url), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-market-update-secret": secret
    },
    body: JSON.stringify({
      dryRun: false,
      runDate,
      artistLimit: FAST_SCAN_ARTIST_CAP,
      includeGdelt: false,
      includeMediaRss: true,
      includeGoogleNews: true,
      includeAiResearch: false,
      rssLookbackDays: 3,
      rssMaxItemsPerFeed: 30,
      delayMs: 100,
      timeoutMs: 12_000
    })
  });
  const eventScan = await readJson(eventScanResponse);

  if (!eventScanResponse.ok || eventScan.ok === false) {
    return NextResponse.json(
      {
        ok: false,
        runDate,
        stage: "event-scan",
        error: eventScan.error ?? "Fast catalyst discovery failed.",
        eventScan
      },
      { status: eventScanResponse.status || 500 }
    );
  }

  const pending = await loadPendingCatalysts();

  if (!pending.length) {
    return NextResponse.json({
      ok: true,
      runDate,
      repriced: false,
      reason: "No newly detected high-impact catalysts need repricing.",
      eventScan
    });
  }

  const artistIds = pending.map((candidate) => candidate.artistId);
  const marketUpdateResponse = await fetch(new URL("/api/admin/daily-market-update", request.url), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-market-update-secret": secret
    },
    body: JSON.stringify({
      dryRun: false,
      source: "core",
      runDate,
      artistIds,
      intraday: true
    })
  });
  const marketUpdate = await readJson(marketUpdateResponse);

  if (!marketUpdateResponse.ok || marketUpdate.ok === false) {
    return NextResponse.json(
      {
        ok: false,
        runDate,
        stage: "repricing",
        error: marketUpdate.error ?? "Catalysts were found, but quote refresh failed; affected trades remain paused.",
        affectedArtists: pending,
        eventScan,
        marketUpdate
      },
      { status: marketUpdateResponse.status || 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    runDate,
    repriced: true,
    affectedArtists: pending,
    eventScan,
    marketUpdate
  });
}

async function loadPendingCatalysts() {
  const supabase = createServiceRoleClient();
  const detectedAfter = new Date(
    Date.now() - RECENT_DETECTION_WINDOW_HOURS * 60 * 60 * 1000
  ).toISOString();
  const { data: events, error: eventError } = await supabase
    .from("market_events")
    .select("artist_id,title,source_url,raw_payload,event_date,event_type,created_at")
    .gte("created_at", detectedAfter)
    .gte("confidence", PENDING_CATALYST_MIN_CONFIDENCE)
    .or(`impact_score.gte.${PENDING_CATALYST_MIN_IMPACT},impact_score.lte.-${PENDING_CATALYST_MIN_IMPACT}`)
    .order("created_at", { ascending: false })
    .limit(500);

  if (eventError) {
    throw new Error(`Could not inspect new market catalysts: ${eventError.message}`);
  }

  const candidates = (events ?? []) as CandidateEvent[];
  const artistIds = Array.from(new Set(candidates.map((event) => event.artist_id)));

  if (!artistIds.length) {
    return [];
  }

  const { data: ticks, error: tickError } = await supabase
    .from("price_ticks")
    .select("artist_id,observed_at")
    .in("artist_id", artistIds)
    .eq("source", "market_run")
    .order("observed_at", { ascending: false })
    .limit(Math.min(1_000, artistIds.length * 12));

  if (tickError) {
    throw new Error(`Could not inspect quote timestamps: ${tickError.message}`);
  }

  const latestQuoteByArtist = new Map<string, string>();

  for (const tick of ticks ?? []) {
    if (!latestQuoteByArtist.has(tick.artist_id)) {
      latestQuoteByArtist.set(tick.artist_id, tick.observed_at);
    }
  }

  const selected = new Map<string, { artistId: string; title: string; detectedAt: string }>();

  for (const event of candidates) {
    if (selected.has(event.artist_id)) {
      continue;
    }

    const rawPayload = event.raw_payload && typeof event.raw_payload === "object" && !Array.isArray(event.raw_payload)
      ? event.raw_payload as Record<string, unknown>
      : {};

    if (!isStoredMarketEventSourceIntegrityValid(rawPayload, {
      eventDate: event.event_date,
      title: event.title,
      sourceUrl: event.source_url
    })) {
      continue;
    }

    if (!isPendingCatalyst({
      event: {
        createdAt: event.created_at,
        eventDate: event.event_date,
        eventType: event.event_type
      },
      quotedAt: latestQuoteByArtist.get(event.artist_id) ?? null
    })) {
      continue;
    }

    selected.set(event.artist_id, {
      artistId: event.artist_id,
      title: event.title,
      detectedAt: event.created_at
    });
  }

  return [...selected.values()].slice(0, MAX_INTRADAY_ARTISTS);
}

function isAuthorized(request: Request) {
  const authorization = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET?.trim();
  const marketSecret = process.env.MARKET_UPDATE_SECRET?.trim();

  return (
    secureCompare(authorization, cronSecret ? `Bearer ${cronSecret}` : null)
    || secureCompare(request.headers.get("x-market-update-secret"), marketSecret)
    || secureCompare(authorization, marketSecret ? `Bearer ${marketSecret}` : null)
  );
}

async function readJson(response: Response): Promise<AutomationResponse> {
  try {
    return await response.json() as AutomationResponse;
  } catch {
    return { ok: false, error: `Automation endpoint returned HTTP ${response.status}.` };
  }
}
