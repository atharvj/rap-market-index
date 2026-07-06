import { NextResponse } from "next/server";
import { createServiceRoleClient, getSupabaseConfigStatus } from "@/lib/supabase/server";
import { requireAdminRequest } from "@/server/admin-auth";
import { flattenEvents } from "@/server/market/event-signals";
import { collectGdeltMarketSignals } from "@/server/market/gdelt-source";
import { getPacificMarketDate } from "@/server/market/market-date";
import type { MarketUpdateArtist } from "@/server/market/daily-update";
import type { MarketEvent } from "@/server/market/market-data";
import {
  loadActiveArtists,
  loadArtistExternalIds,
  loadLatestObservationDates,
  loadObservationBaselines,
  persistMarketEvents,
  persistMarketObservations
} from "@/server/market/supabase-repository";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

type MarketEventScanBody = {
  dryRun?: boolean;
  runDate?: string;
  artistLimit?: number;
  maxRecords?: number;
  delayMs?: number;
  timeoutMs?: number;
};

const DEFAULT_ARTIST_LIMIT = 10;
const MAX_ARTIST_LIMIT = 20;
const DEFAULT_MAX_RECORDS = 12;
const MAX_GDELT_RECORDS = 50;
const DEFAULT_DELAY_MS = 5200;
const DEFAULT_TIMEOUT_MS = 12000;

export async function GET(request: Request) {
  const auth = await requireAdminRequest(request);

  if (!auth.ok) {
    return auth.response;
  }

  return NextResponse.json({
    ok: true,
    config: getSupabaseConfigStatus(),
    endpoint: "/api/admin/market-event-scan"
  });
}

export async function POST(request: Request) {
  const auth = await requireAdminRequest(request);

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

  try {
    const body = await parseBody(request);
    const dryRun = body.dryRun !== false;
    const runDate = normalizeDate(body.runDate) ?? getPacificMarketDate();
    const artistLimit = normalizeInteger(body.artistLimit, DEFAULT_ARTIST_LIMIT, 1, MAX_ARTIST_LIMIT);
    const maxRecords = normalizeInteger(body.maxRecords, DEFAULT_MAX_RECORDS, 1, MAX_GDELT_RECORDS);
    const delayMs = normalizeInteger(body.delayMs, DEFAULT_DELAY_MS, 0, 15000);
    const timeoutMs = normalizeInteger(body.timeoutMs, DEFAULT_TIMEOUT_MS, 1000, 30000);
    const supabase = createServiceRoleClient();
    const allArtists = await loadActiveArtists(supabase);
    const artistIds = allArtists.map((artist) => artist.id);
    const latestGdeltDates = await loadLatestObservationDates({
      supabase,
      artistIds,
      source: "gdelt",
      metric: "article_count",
      runDate
    });
    const artists = selectArtistsForEventScan({
      artists: allArtists,
      latestGdeltDates,
      limit: artistLimit
    });
    const selectedArtistIds = artists.map((artist) => artist.id);
    const [externalIds, baselines] = await Promise.all([
      loadArtistExternalIds(supabase, selectedArtistIds),
      loadObservationBaselines({
        supabase,
        artistIds: selectedArtistIds,
        source: "gdelt",
        metrics: ["article_count"],
        beforeDate: runDate,
        lookbackDays: 30
      })
    ]);
    const result = await collectGdeltMarketSignals({
      artists,
      runDate,
      externalIds,
      baselines,
      delayMs,
      maxRecords,
      timeoutMs
    });
    const events = flattenEvents(result.eventsByArtist);

    if (!dryRun) {
      await persistMarketObservations(supabase, result.observations);
      await persistMarketEvents(supabase, events);
    }

    return NextResponse.json({
      ok: true,
      dryRun,
      persisted: !dryRun,
      config,
      runDate,
      source: "gdelt_event_scan",
      totalArtistCount: allArtists.length,
      scannedArtistCount: artists.length,
      observationCount: result.observations.length,
      eventCount: events.length,
      eventTypeCounts: countEventsByType(events),
      artists: artists.map((artist) => ({
        id: artist.id,
        ticker: artist.ticker,
        name: artist.name,
        latestNewsScanDate: latestGdeltDates[artist.id] ?? null
      })),
      topEvents: events.slice(0, 8).map((event) => ({
        artistId: event.artistId,
        eventDate: event.eventDate,
        eventType: event.eventType,
        title: event.title,
        sourceName: event.sourceName ?? null,
        confidence: event.confidence,
        impactScore: event.impactScore,
        sentimentScore: event.sentimentScore
      }))
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: formatMarketEventScanError(error),
        config
      },
      { status: 500 }
    );
  }
}

async function parseBody(request: Request): Promise<MarketEventScanBody> {
  try {
    return (await request.json()) as MarketEventScanBody;
  } catch {
    return {};
  }
}

function selectArtistsForEventScan({
  artists,
  latestGdeltDates,
  limit
}: {
  artists: MarketUpdateArtist[];
  latestGdeltDates: Record<string, string>;
  limit: number;
}) {
  return [...artists]
    .sort((first, second) => {
      const firstDate = latestGdeltDates[first.id] ?? "";
      const secondDate = latestGdeltDates[second.id] ?? "";

      if (firstDate !== secondDate) {
        return firstDate.localeCompare(secondDate);
      }

      return first.ticker.localeCompare(second.ticker);
    })
    .slice(0, limit);
}

function countEventsByType(events: MarketEvent[]) {
  return events.reduce<Record<string, number>>((counts, event) => {
    counts[event.eventType] = (counts[event.eventType] ?? 0) + 1;
    return counts;
  }, {});
}

function normalizeInteger(value: unknown, fallback: number, min: number, max: number) {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, value));
}

function normalizeDate(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function formatMarketEventScanError(error: unknown) {
  const message = error instanceof Error ? error.message : "Market event scan failed.";
  const normalized = message.toLowerCase();

  if (
    normalized.includes("market_events") ||
    normalized.includes("market_observations") ||
    normalized.includes("schema cache")
  ) {
    return "Market event scan storage needs setup. Run the Supabase market engine migrations through 007_market_events.sql.";
  }

  return message;
}
