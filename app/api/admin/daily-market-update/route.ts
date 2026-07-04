import { NextResponse } from "next/server";
import { createServiceRoleClient, getSupabaseConfigStatus } from "@/lib/supabase/server";
import type { HypeStats } from "@/lib/types";
import {
  calculateDailyMarketUpdates,
  mergeAdapterSignals,
  type ManualSignals,
  type MarketUpdateSummary,
  type MarketUpdateSource
} from "@/server/market/daily-update";
import {
  buildEventMarketSignals,
  flattenEvents,
  mergeEvents,
  normalizeManualMarketEvents,
  type ManualMarketEvents
} from "@/server/market/event-signals";
import { collectGdeltMarketSignals } from "@/server/market/gdelt-source";
import { collectLastfmMarketSignals } from "@/server/market/lastfm-source";
import { collectMusicbrainzReleaseEvents } from "@/server/market/musicbrainz-releases";
import { collectSpotifyMarketSignals } from "@/server/market/spotify-source";
import { collectYoutubeMarketSignals } from "@/server/market/youtube-source";
import { collectYoutubeCommentMarketSignals } from "@/server/market/youtube-comments-source";
import { getMockMarketArtists } from "@/server/market/mock-source";
import type {
  AdapterSignals,
  ArtistExternalIds,
  MarketObservation,
  ObservationBaselines
} from "@/server/market/market-data";
import {
  loadActiveArtists,
  loadActiveArtistCount,
  loadActiveArtistsPage,
  loadArtistExternalIds,
  loadObservationBaselines,
  loadRecentMarketEvents,
  persistMarketEvents,
  persistMarketObservations,
  persistMarketUpdates
} from "@/server/market/supabase-repository";

export const dynamic = "force-dynamic";

type DailyUpdateBody = {
  dryRun?: boolean;
  source?: MarketUpdateSource;
  runDate?: string;
  manualSignals?: ManualSignals;
  manualEvents?: ManualMarketEvents;
  artistLimit?: number;
  artistOffset?: number;
};

type ArtistBatch = {
  artists: ReturnType<typeof getMockMarketArtists>;
  batch: NonNullable<MarketUpdateSummary["batch"]>;
};

const DEFAULT_LIVE_REAL_SOURCE_BATCH_SIZE = 50;
const MAX_ARTIST_BATCH_SIZE = 100;

export async function GET() {
  return NextResponse.json({
    ok: true,
    config: getSupabaseConfigStatus(),
    endpoint: "/api/admin/daily-market-update"
  });
}

export async function POST(request: Request) {
  const body = await parseBody(request);
  const dryRun = body.dryRun !== false;
  const source = normalizeSource(body.source);
  const runDate = body.runDate ?? getToday();
  const config = getSupabaseConfigStatus();

  if (!dryRun) {
    const secret = process.env.MARKET_UPDATE_SECRET;
    const providedSecret = request.headers.get("x-market-update-secret");

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
  }

  try {
    const supabase = config.readyForAdminWrites ? createServiceRoleClient() : null;
    const { artists, batch } = await loadArtistBatch({
      source,
      supabase,
      dryRun,
      artistLimit: body.artistLimit,
      artistOffset: body.artistOffset
    });
    const realSignals = await collectRealSignals({
      source,
      artists,
      runDate,
      supabase,
      dryRun
    });
    const eventSignals = await collectEventSignals({
      source,
      artists,
      runDate,
      supabase,
      dryRun,
      externalIds: realSignals.externalIds,
      manualEvents: body.manualEvents
    });
    const adapterSignals = mergeAdapterSignals(...realSignals.adapterSignalSources, eventSignals.adapterSignals);
    const warnings = [...realSignals.warnings, ...eventSignals.warnings];
    const result = calculateDailyMarketUpdates({
      artists,
      runDate,
      source,
      manualSignals: sanitizeManualSignals(body.manualSignals),
      adapterSignals
    });
    const summary = {
      ...result.summary,
      batch
    } satisfies MarketUpdateSummary;

    if (!dryRun) {
      const eventsToPersist = flattenEvents(
        mergeEvents(eventSignals.detectedEventsByArtist, eventSignals.submittedEventsByArtist)
      );

      if (eventsToPersist.length) {
        await persistMarketEvents(createServiceRoleClient(), eventsToPersist);
      }

      if (realSignals.observations.length) {
        await persistMarketObservations(createServiceRoleClient(), realSignals.observations);
      }

      await persistMarketUpdates({
        supabase: createServiceRoleClient(),
        runDate,
        source,
        updates: result.updates,
        summary
      });
    }

    return NextResponse.json({
      ok: true,
      dryRun,
      persisted: !dryRun,
      config,
      warnings,
      observationCount: realSignals.observations.length,
      eventCount: eventSignals.eventCount,
      detectedEventCount: flattenEvents(eventSignals.detectedEventsByArtist).length,
      submittedEventCount: flattenEvents(eventSignals.submittedEventsByArtist).length,
      batch,
      summary,
      updates: result.updates
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown daily market update error.",
        config
      },
      { status: 500 }
    );
  }
}

async function parseBody(request: Request): Promise<DailyUpdateBody> {
  try {
    return (await request.json()) as DailyUpdateBody;
  } catch {
    return {};
  }
}

function normalizeSource(source: DailyUpdateBody["source"]): MarketUpdateSource {
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

  return "mock";
}

function sanitizeManualSignals(signals: DailyUpdateBody["manualSignals"]): ManualSignals | undefined {
  if (!signals || typeof signals !== "object") {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(signals).map(([key, value]) => [
      key,
      {
        streamingGrowth: getNumber(value.streamingGrowth),
        youtubeGrowth: getNumber(value.youtubeGrowth),
        searchGrowth: getNumber(value.searchGrowth),
        socialGrowth: getNumber(value.socialGrowth),
        newsScore: getNumber(value.newsScore),
        traderDemand: getNumber(value.traderDemand)
      } satisfies Partial<HypeStats>
    ])
  );
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function limitArtists<T>(artists: T[], limit: unknown) {
  if (typeof limit !== "number" || !Number.isInteger(limit) || limit <= 0) {
    return artists;
  }

  return artists.slice(0, Math.min(limit, artists.length));
}

async function loadArtistBatch({
  source,
  supabase,
  dryRun,
  artistLimit,
  artistOffset
}: {
  source: MarketUpdateSource;
  supabase: ReturnType<typeof createServiceRoleClient> | null;
  dryRun: boolean;
  artistLimit: unknown;
  artistOffset: unknown;
}): Promise<ArtistBatch> {
  const request = normalizeArtistBatchRequest({ source, dryRun, artistLimit, artistOffset });

  if (dryRun || !supabase) {
    const allArtists = getMockMarketArtists();
    const artists = sliceArtistBatch(allArtists, request.offset, request.limit);

    return {
      artists,
      batch: buildBatchSummary({
        offset: request.offset,
        limit: request.limit,
        artistCount: artists.length,
        totalArtists: allArtists.length
      })
    };
  }

  const totalArtists = await loadActiveArtistCount(supabase);
  const artists =
    typeof request.limit === "number"
      ? await loadActiveArtistsPage({
          supabase,
          offset: request.offset,
          limit: request.limit
        })
      : (await loadActiveArtists(supabase)).slice(request.offset);

  return {
    artists,
    batch: buildBatchSummary({
      offset: request.offset,
      limit: request.limit,
      artistCount: artists.length,
      totalArtists
    })
  };
}

function normalizeArtistBatchRequest({
  source,
  dryRun,
  artistLimit,
  artistOffset
}: {
  source: MarketUpdateSource;
  dryRun: boolean;
  artistLimit: unknown;
  artistOffset: unknown;
}) {
  const offset =
    typeof artistOffset === "number" && Number.isInteger(artistOffset) && artistOffset > 0 ? artistOffset : 0;
  const requestedLimit =
    typeof artistLimit === "number" && Number.isInteger(artistLimit) && artistLimit > 0
      ? Math.min(artistLimit, MAX_ARTIST_BATCH_SIZE)
      : null;
  const defaultLimit =
    !dryRun && isRealExternalSource(source) ? DEFAULT_LIVE_REAL_SOURCE_BATCH_SIZE : null;

  return {
    offset,
    limit: requestedLimit ?? defaultLimit
  };
}

function isRealExternalSource(source: MarketUpdateSource) {
  return (
    source === "gdelt" ||
    source === "lastfm" ||
    source === "spotify" ||
    source === "youtube" ||
    source === "core" ||
    source === "blended"
  );
}

function sliceArtistBatch<T>(artists: T[], offset: number, limit: number | null) {
  if (typeof limit !== "number") {
    return artists.slice(offset);
  }

  return artists.slice(offset, offset + limit);
}

function buildBatchSummary({
  offset,
  limit,
  artistCount,
  totalArtists
}: {
  offset: number;
  limit: number | null;
  artistCount: number;
  totalArtists: number;
}): NonNullable<MarketUpdateSummary["batch"]> {
  const nextOffset = offset + artistCount;

  return {
    offset,
    limit,
    artistCount,
    totalArtists,
    nextOffset: nextOffset < totalArtists ? nextOffset : null,
    hasMore: nextOffset < totalArtists
  };
}

async function collectRealSignals({
  source,
  artists,
  runDate,
  supabase,
  dryRun
}: {
  source: MarketUpdateSource;
  artists: ReturnType<typeof getMockMarketArtists>;
  runDate: string;
  supabase: ReturnType<typeof createServiceRoleClient> | null;
  dryRun: boolean;
}): Promise<{
  adapterSignals?: AdapterSignals;
  adapterSignalSources: AdapterSignals[];
  observations: MarketObservation[];
  warnings: string[];
  externalIds: Record<string, ArtistExternalIds>;
}> {
  const useGdelt = source === "gdelt" || source === "blended";
  const useLastfm = source === "lastfm" || source === "core" || source === "blended";
  const useSpotify = source === "spotify" || source === "core" || source === "blended";
  const useYoutube = source === "youtube" || source === "core" || source === "blended";

  if (!useGdelt && !useLastfm && !useSpotify && !useYoutube) {
    return {
      adapterSignalSources: [],
      observations: [],
      warnings: [],
      externalIds: {}
    };
  }

  const artistIds = artists.map((artist) => artist.id);
  let externalIds: Record<string, ArtistExternalIds> = {};
  let gdeltBaselines: ObservationBaselines = {};
  let lastfmBaselines: ObservationBaselines = {};
  let spotifyBaselines: ObservationBaselines = {};
  let youtubeBaselines: ObservationBaselines = {};
  let youtubeCommentBaselines: ObservationBaselines = {};

  if (supabase) {
    try {
      [externalIds, gdeltBaselines, lastfmBaselines, spotifyBaselines, youtubeBaselines, youtubeCommentBaselines] = await Promise.all([
        loadArtistExternalIds(supabase, artistIds),
        useGdelt
          ? loadObservationBaselines({
              supabase,
              artistIds,
              source: "gdelt",
              metrics: ["article_count"],
              beforeDate: runDate,
              lookbackDays: 30
            })
          : Promise.resolve({}),
        useLastfm
          ? loadObservationBaselines({
              supabase,
              artistIds,
              source: "lastfm",
              metrics: ["listeners", "playcount"],
              beforeDate: runDate,
              lookbackDays: 30
            })
          : Promise.resolve({}),
        useSpotify
          ? loadObservationBaselines({
              supabase,
              artistIds,
              source: "spotify",
              metrics: ["popularity", "followers_total"],
              beforeDate: runDate,
              lookbackDays: 30
            })
          : Promise.resolve({}),
        useYoutube
          ? loadObservationBaselines({
              supabase,
              artistIds,
              source: "youtube",
              metrics: ["channel_views", "subscriber_count", "video_count"],
              beforeDate: runDate,
              lookbackDays: 30
            })
          : Promise.resolve({}),
        useYoutube
          ? loadObservationBaselines({
              supabase,
              artistIds,
              source: "youtube_comments",
              metrics: [
                "comment_sentiment",
                "comment_count",
                "comment_like_count",
                "positive_comment_share",
                "negative_comment_share"
              ],
              beforeDate: runDate,
              lookbackDays: 30
            })
          : Promise.resolve({})
      ]);
    } catch (error) {
      if (!dryRun) {
        throw error;
      }
    }
  }

  const sources: AdapterSignals[] = [];
  const observations: MarketObservation[] = [];
  const warnings: string[] = [];

  if (useGdelt) {
    const gdelt = await collectGdeltMarketSignals({
      artists,
      runDate,
      externalIds,
      baselines: gdeltBaselines
    });

    sources.push(gdelt.signals);
    observations.push(...gdelt.observations);
  }

  if (useLastfm) {
    const lastfm = await collectLastfmMarketSignals({
      artists,
      runDate,
      apiKey: process.env.LASTFM_API_KEY,
      externalIds,
      baselines: lastfmBaselines
    });

    sources.push(lastfm.signals);
    observations.push(...lastfm.observations);
    warnings.push(...lastfm.warnings);
  }

  if (useSpotify) {
    const spotify = await collectSpotifyMarketSignals({
      artists,
      runDate,
      credentials: {
        clientId: process.env.SPOTIFY_CLIENT_ID,
        clientSecret: process.env.SPOTIFY_CLIENT_SECRET
      },
      externalIds,
      baselines: spotifyBaselines
    });

    sources.push(spotify.signals);
    observations.push(...spotify.observations);
    warnings.push(...spotify.warnings);
  }

  if (useYoutube) {
    const youtube = await collectYoutubeMarketSignals({
      artists,
      runDate,
      apiKey: process.env.YOUTUBE_API_KEY,
      externalIds,
      baselines: youtubeBaselines
    });

    sources.push(youtube.signals);
    observations.push(...youtube.observations);
    warnings.push(...youtube.warnings);

    const youtubeComments = await collectYoutubeCommentMarketSignals({
      artists,
      runDate,
      apiKey: process.env.YOUTUBE_API_KEY,
      externalIds,
      baselines: youtubeCommentBaselines
    });

    sources.push(youtubeComments.signals);
    observations.push(...youtubeComments.observations);
    warnings.push(...youtubeComments.warnings);
  }

  return {
    adapterSignals: mergeAdapterSignals(...sources),
    adapterSignalSources: sources,
    observations,
    warnings,
    externalIds
  };
}

async function collectEventSignals({
  source,
  artists,
  runDate,
  supabase,
  dryRun,
  externalIds,
  manualEvents
}: {
  source: MarketUpdateSource;
  artists: ReturnType<typeof getMockMarketArtists>;
  runDate: string;
  supabase: ReturnType<typeof createServiceRoleClient> | null;
  dryRun: boolean;
  externalIds: Record<string, ArtistExternalIds>;
  manualEvents?: ManualMarketEvents;
}) {
  const artistIds = artists.map((artist) => artist.id);
  let storedEvents = {};
  let detectedEventsByArtist = {};
  const warnings: string[] = [];

  if (supabase) {
    try {
      storedEvents = await loadRecentMarketEvents({
        supabase,
        artistIds,
        runDate,
        lookbackDays: 30
      });
    } catch (error) {
      if (!dryRun) {
        throw error;
      }
    }
  }

  if ((source === "core" || source === "blended") && supabase) {
    const releaseEvents = await collectMusicbrainzReleaseEvents({
      artists,
      runDate,
      externalIds
    });

    detectedEventsByArtist = releaseEvents.eventsByArtist;
    warnings.push(...releaseEvents.warnings);
  }

  const submittedEventsByArtist = normalizeManualMarketEvents({
    manualEvents,
    artists,
    runDate
  });
  const eventsByArtist = mergeEvents(mergeEvents(storedEvents, detectedEventsByArtist), submittedEventsByArtist);
  const eventCount = Object.values(eventsByArtist).reduce((total, events) => total + events.length, 0);

  return {
    adapterSignals: buildEventMarketSignals({
      artists,
      runDate,
      eventsByArtist
    }),
    eventCount,
    detectedEventsByArtist,
    warnings,
    submittedEventsByArtist
  };
}
