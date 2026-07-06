import { NextResponse } from "next/server";
import { createServiceRoleClient, getSupabaseConfigStatus } from "@/lib/supabase/server";
import { requireAdminRequest } from "@/server/admin-auth";
import { flattenEvents, mergeEvents } from "@/server/market/event-signals";
import { collectGdeltMarketSignals } from "@/server/market/gdelt-source";
import { collectMediaRssMarketEvents } from "@/server/market/media-rss-source";
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
  artistIds?: string[];
  artistLimit?: number;
  maxRecords?: number;
  delayMs?: number;
  timeoutMs?: number;
  rssFeedUrls?: string[];
  rssLookbackDays?: number;
  rssMaxItemsPerFeed?: number;
  includeGoogleNews?: boolean;
};

const DEFAULT_ARTIST_LIMIT = 10;
const MAX_ARTIST_LIMIT = 20;
const DEFAULT_MAX_RECORDS = 12;
const MAX_GDELT_RECORDS = 50;
const DEFAULT_DELAY_MS = 5200;
const DEFAULT_TIMEOUT_MS = 12000;
const DEFAULT_RSS_LOOKBACK_DAYS = 30;
const DEFAULT_RSS_MAX_ITEMS_PER_FEED = 40;

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
    const [latestGdeltDates, latestMediaRssDates] = await Promise.all([
      loadLatestObservationDates({
        supabase,
        artistIds,
        source: "gdelt",
        metric: "article_count",
        runDate
      }),
      loadLatestObservationDates({
        supabase,
        artistIds,
        source: "media_rss",
        metric: "article_count",
        runDate
      })
    ]);
    const requestedArtistIds = normalizeArtistIds(body.artistIds);
    const artists = requestedArtistIds.length
      ? selectRequestedArtists({
          artists: allArtists,
          requestedArtistIds,
          limit: artistLimit
        })
      : selectArtistsForEventScan({
          artists: allArtists,
          latestGdeltDates,
          latestMediaRssDates,
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
    const mediaRss = await collectMediaRssMarketEvents({
      artists,
      runDate,
      externalIds,
      feedUrls: normalizeFeedUrls(body.rssFeedUrls) ?? getEnvList("MARKET_RSS_FEEDS"),
      includeGoogleNews: body.includeGoogleNews ?? getEnvBoolean("MARKET_RSS_GOOGLE_NEWS", true),
      lookbackDays: normalizeInteger(
        body.rssLookbackDays,
        getEnvInteger("MARKET_RSS_LOOKBACK_DAYS", DEFAULT_RSS_LOOKBACK_DAYS, 1, 30),
        1,
        30
      ),
      maxItemsPerFeed: normalizeInteger(
        body.rssMaxItemsPerFeed,
        getEnvInteger("MARKET_RSS_MAX_ITEMS_PER_FEED", DEFAULT_RSS_MAX_ITEMS_PER_FEED, 5, 100),
        5,
        100
      ),
      delayMs: Math.min(delayMs, 1000),
      timeoutMs
    });
    const mergedEventsByArtist = mergeEvents(result.eventsByArtist, mediaRss.eventsByArtist);
    const events = flattenEvents(mergedEventsByArtist);
    const observations = [...result.observations, ...mediaRss.observations];

    if (!dryRun) {
      await persistMarketObservations(supabase, observations);
      await persistMarketEvents(supabase, events);
    }

    return NextResponse.json({
      ok: true,
      dryRun,
      persisted: !dryRun,
      config,
      runDate,
      source: "market_event_scan",
      totalArtistCount: allArtists.length,
      scannedArtistCount: artists.length,
      observationCount: observations.length,
      eventCount: events.length,
      gdeltEventCount: flattenEvents(result.eventsByArtist).length,
      mediaRssEventCount: flattenEvents(mediaRss.eventsByArtist).length,
      mediaRssScannedFeedCount: mediaRss.scannedFeedCount,
      warnings: mediaRss.warnings,
      eventTypeCounts: countEventsByType(events),
      artists: artists.map((artist) => ({
        id: artist.id,
        ticker: artist.ticker,
        name: artist.name,
        latestNewsScanDate: getOldestScanDate(latestGdeltDates[artist.id], latestMediaRssDates[artist.id])
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

function selectRequestedArtists({
  artists,
  requestedArtistIds,
  limit
}: {
  artists: MarketUpdateArtist[];
  requestedArtistIds: string[];
  limit: number;
}) {
  const requested = new Set(requestedArtistIds);

  return artists.filter((artist) => requested.has(artist.id)).slice(0, limit);
}

function selectArtistsForEventScan({
  artists,
  latestGdeltDates,
  latestMediaRssDates,
  limit
}: {
  artists: MarketUpdateArtist[];
  latestGdeltDates: Record<string, string>;
  latestMediaRssDates: Record<string, string>;
  limit: number;
}) {
  return [...artists]
    .sort((first, second) => {
      const firstDate = getOldestScanDate(latestGdeltDates[first.id], latestMediaRssDates[first.id]) ?? "";
      const secondDate = getOldestScanDate(latestGdeltDates[second.id], latestMediaRssDates[second.id]) ?? "";

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

function normalizeArtistIds(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter((artistId): artistId is string => typeof artistId === "string")
        .map((artistId) => artistId.trim().toLowerCase())
        .filter((artistId) => /^[a-z0-9-]+$/.test(artistId))
    )
  );
}

function getEnvInteger(name: string, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

function getEnvBoolean(name: string, fallback: boolean) {
  const value = process.env[name]?.trim().toLowerCase();

  if (!value) {
    return fallback;
  }

  return value === "1" || value === "true" || value === "yes";
}

function getEnvList(name: string) {
  const values = (process.env[name] ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return values.length ? values : undefined;
}

function normalizeFeedUrls(values: unknown) {
  if (!Array.isArray(values)) {
    return undefined;
  }

  const urls = values.filter(
    (value): value is string => typeof value === "string" && Boolean(value.trim())
  );

  return urls.length ? urls : undefined;
}

function getOldestScanDate(first?: string, second?: string) {
  if (first && second) {
    return first < second ? first : second;
  }

  return first ?? second ?? null;
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
