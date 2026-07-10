import { NextResponse } from "next/server";
import { createServiceRoleClient, getSupabaseConfigStatus } from "@/lib/supabase/server";
import { requireAdminRequest } from "@/server/admin-auth";
import { flattenEvents, mergeEvents } from "@/server/market/event-signals";
import { collectAiResearchMarketEvents } from "@/server/market/ai-research-source";
import { collectGdeltMarketSignals } from "@/server/market/gdelt-source";
import { collectMediaRssMarketEvents, getDefaultMediaRssFeedUrls } from "@/server/market/media-rss-source";
import { getPacificMarketDate } from "@/server/market/market-date";
import type { MarketUpdateArtist } from "@/server/market/daily-update";
import type { MarketEvent } from "@/server/market/market-data";
import { getArtistStatusSubtype, shouldRecommendStatusTradingHalt } from "@/server/market/status-events";
import {
  loadActiveArtists,
  loadArtistExternalIds,
  loadLatestSourceObservationDates,
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
  includeAiResearch?: boolean;
  aiResearchArtistLimit?: number;
  aiResearchLookbackDays?: number;
  aiResearchMaxEventsPerArtist?: number;
};

type StatusHaltCandidate = {
  artistId: string;
  ticker: string;
  name: string;
  statusSubtype: string;
  eventTitle: string;
  eventDate: string;
  confidence: number;
  reason: string;
};

const DEFAULT_ARTIST_LIMIT = 60;
const MAX_ARTIST_LIMIT = 100;
const DEFAULT_MAX_RECORDS = 12;
const MAX_GDELT_RECORDS = 50;
const DEFAULT_DELAY_MS = 700;
const DEFAULT_TIMEOUT_MS = 12000;
const DEFAULT_RSS_LOOKBACK_DAYS = 30;
const DEFAULT_RSS_MAX_ITEMS_PER_FEED = 40;
const DEFAULT_AI_RESEARCH_LOOKBACK_DAYS = 14;
const DEFAULT_AI_RESEARCH_EVENTS_PER_ARTIST = 1;
const DEFAULT_AI_RESEARCH_ARTIST_LIMIT = 8;
const MAX_AI_RESEARCH_ARTIST_LIMIT = 25;

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
    const [latestGdeltDates, latestMediaRssDates, latestAiResearchDates] = await Promise.all([
      loadLatestSourceObservationDates({
        supabase,
        artistIds,
        source: "gdelt",
        runDate
      }),
      loadLatestSourceObservationDates({
        supabase,
        artistIds,
        source: "media_rss",
        runDate
      }),
      loadLatestSourceObservationDates({
        supabase,
        artistIds,
        source: "ai_research",
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
          latestAiResearchDates,
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
      feedUrls: getConfiguredRssFeedUrls(body.rssFeedUrls),
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
    const aiResearchEnabled = body.includeAiResearch ?? getEnvBoolean("MARKET_AI_RESEARCH_ENABLED", config.aiResearchConfigured);
    const aiResearchArtistLimit = normalizeInteger(
      body.aiResearchArtistLimit,
      getEnvInteger("MARKET_AI_RESEARCH_ARTIST_LIMIT", DEFAULT_AI_RESEARCH_ARTIST_LIMIT, 0, MAX_AI_RESEARCH_ARTIST_LIMIT),
      0,
      MAX_AI_RESEARCH_ARTIST_LIMIT
    );
    const aiResearchArtists = aiResearchEnabled
      ? selectAiResearchArtists(
          artists,
          mergedEventsPreview(mediaRss.eventsByArtist, result.eventsByArtist),
          latestAiResearchDates,
          aiResearchArtistLimit
        )
      : [];
    const aiResearch = aiResearchEnabled
      ? await collectAiResearchMarketEvents({
          artists: aiResearchArtists,
          runDate,
          externalIds,
          apiKey: process.env.GROQ_API_KEY,
          model: process.env.MARKET_AI_RESEARCH_MODEL,
          lookbackDays: normalizeInteger(
            body.aiResearchLookbackDays,
            getEnvInteger("MARKET_AI_RESEARCH_LOOKBACK_DAYS", DEFAULT_AI_RESEARCH_LOOKBACK_DAYS, 1, 30),
            1,
            30
          ),
          maxEventsPerArtist: normalizeInteger(
            body.aiResearchMaxEventsPerArtist,
            getEnvInteger("MARKET_AI_RESEARCH_EVENTS_PER_ARTIST", DEFAULT_AI_RESEARCH_EVENTS_PER_ARTIST, 1, 5),
            1,
            5
          ),
          delayMs: getEnvInteger("MARKET_AI_RESEARCH_DELAY_MS", 2100, 0, 5000),
          timeoutMs
        })
      : {
          observations: [],
          eventsByArtist: {},
          warnings: config.aiResearchConfigured
            ? []
            : ["AI research key is missing; source-backed AI market discovery was skipped."]
        };
    const mergedEventsByArtist = mergeEvents(
      mergeEvents(result.eventsByArtist, mediaRss.eventsByArtist),
      aiResearch.eventsByArtist
    );
    const events = flattenEvents(mergedEventsByArtist);
    const observations = [...result.observations, ...mediaRss.observations, ...aiResearch.observations];
    const statusHaltCandidates = buildStatusHaltCandidates(events, artists);
    const autoHaltStatusEvents = getEnvBoolean("MARKET_AUTO_HALT_DEATH_EVENTS", true);

    if (!dryRun) {
      await persistMarketObservations(supabase, observations);
      await persistMarketEvents(supabase, events);
      if (autoHaltStatusEvents) {
        await persistStatusTradingHalts(supabase, statusHaltCandidates);
      }
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
      aiResearchEnabled,
      aiResearchScannedArtistCount: aiResearchArtists.length,
      aiResearchEventCount: flattenEvents(aiResearch.eventsByArtist).length,
      mediaRssScannedFeedCount: mediaRss.scannedFeedCount,
      warnings: [...mediaRss.warnings, ...aiResearch.warnings],
      autoHaltStatusEvents,
      statusHaltCandidateCount: statusHaltCandidates.length,
      statusHaltCandidates,
      eventTypeCounts: countEventsByType(events),
      artists: artists.map((artist) => ({
        id: artist.id,
        ticker: artist.ticker,
        name: artist.name,
        latestNewsScanDate: getOldestScanDate(
          latestGdeltDates[artist.id],
          latestMediaRssDates[artist.id],
          latestAiResearchDates[artist.id]
        )
      })),
      topEvents: events.slice(0, 8).map((event) => ({
        artistId: event.artistId,
        eventDate: event.eventDate,
        eventType: event.eventType,
        title: event.title,
        sourceName: event.sourceName ?? null,
        confidence: event.confidence,
        impactScore: event.impactScore,
        sentimentScore: event.sentimentScore,
        statusSubtype: getArtistStatusSubtype(event.rawPayload.statusSubtype)
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

function selectAiResearchArtists(
  artists: MarketUpdateArtist[],
  existingEventsByArtist: Record<string, MarketEvent[]>,
  latestAiResearchDates: Record<string, string>,
  limit: number
) {
  if (limit <= 0) {
    return [];
  }

  return [...artists]
    .sort((first, second) => {
      const firstScanDate = latestAiResearchDates[first.id] ?? "";
      const secondScanDate = latestAiResearchDates[second.id] ?? "";

      if (firstScanDate !== secondScanDate) {
        return firstScanDate.localeCompare(secondScanDate);
      }

      const firstEvents = existingEventsByArtist[first.id]?.length ?? 0;
      const secondEvents = existingEventsByArtist[second.id]?.length ?? 0;

      if (firstEvents !== secondEvents) {
        return firstEvents - secondEvents;
      }

      return first.ticker.localeCompare(second.ticker);
    })
    .slice(0, limit);
}

function mergedEventsPreview(
  first: Record<string, MarketEvent[]>,
  second: Record<string, MarketEvent[]>
) {
  const merged: Record<string, MarketEvent[]> = { ...first };

  for (const [artistId, events] of Object.entries(second)) {
    merged[artistId] = [...(merged[artistId] ?? []), ...events];
  }

  return merged;
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
  latestAiResearchDates,
  limit
}: {
  artists: MarketUpdateArtist[];
  latestGdeltDates: Record<string, string>;
  latestMediaRssDates: Record<string, string>;
  latestAiResearchDates: Record<string, string>;
  limit: number;
}) {
  return [...artists]
    .sort((first, second) => {
      const firstDate =
        getOldestScanDate(
          latestGdeltDates[first.id],
          latestMediaRssDates[first.id],
          latestAiResearchDates[first.id]
        ) ?? "";
      const secondDate =
        getOldestScanDate(
          latestGdeltDates[second.id],
          latestMediaRssDates[second.id],
          latestAiResearchDates[second.id]
        ) ?? "";

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

function buildStatusHaltCandidates(events: MarketEvent[], artists: MarketUpdateArtist[]): StatusHaltCandidate[] {
  const artistsById = new Map(artists.map((artist) => [artist.id, artist]));
  const seen = new Set<string>();
  const candidates: StatusHaltCandidate[] = [];

  for (const event of events) {
    if (!shouldRecommendStatusTradingHalt(event)) {
      continue;
    }

    const artist = artistsById.get(event.artistId);

    if (!artist || seen.has(artist.id)) {
      continue;
    }

    const statusSubtype = getArtistStatusSubtype(event.rawPayload.statusSubtype);

    candidates.push({
      artistId: artist.id,
      ticker: artist.ticker,
      name: artist.name,
      statusSubtype: statusSubtype ?? "unknown",
      eventTitle: event.title,
      eventDate: event.eventDate,
      confidence: event.confidence,
      reason: `Trading halted for ${artist.ticker} while a reported artist status event is reviewed: ${event.title}`
    });
    seen.add(artist.id);
  }

  return candidates;
}

async function persistStatusTradingHalts(
  supabase: ReturnType<typeof createServiceRoleClient>,
  candidates: StatusHaltCandidate[]
) {
  if (!candidates.length) {
    return;
  }

  const { error } = await supabase.from("artist_trading_halts").upsert(
    candidates.map((candidate) => ({
      artist_id: candidate.artistId,
      is_halted: true,
      reason: candidate.reason,
      starts_at: new Date().toISOString(),
      ends_at: null
    }))
  );

  if (error) {
    throw new Error(`Could not apply status trading halt: ${error.message}`);
  }
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

function getConfiguredRssFeedUrls(bodyValues: unknown) {
  const requested = normalizeFeedUrls(bodyValues);

  if (requested) {
    return requested;
  }

  const configuredFeeds = getEnvList("MARKET_RSS_FEEDS");
  const reviewerFeeds = getEnvList("MARKET_REVIEWER_RSS_FEEDS") ?? [];

  if (!configuredFeeds && !reviewerFeeds.length) {
    return undefined;
  }

  return Array.from(new Set([...(configuredFeeds ?? getDefaultMediaRssFeedUrls()), ...reviewerFeeds]));
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

function getOldestScanDate(...dates: Array<string | undefined>) {
  const presentDates = dates.filter((date): date is string => Boolean(date));

  return presentDates.sort()[0] ?? null;
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
