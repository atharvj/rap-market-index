import { NextResponse } from "next/server";
import { createServiceRoleClient, getSupabaseConfigStatus } from "@/lib/supabase/server";
import type { HypeStats } from "@/lib/types";
import { requireAdminRequest } from "@/server/admin-auth";
import {
  calculateDailyMarketUpdates,
  mergeAdapterSignals,
  type ManualSignals,
  type MarketUpdateSummary,
  type MarketUpdateSource
} from "@/server/market/daily-update";
import { collectBlueskyMarketSignals } from "@/server/market/bluesky-source";
import {
  attachAudienceScaleCalibration,
  type AudienceScaleSnapshots
} from "@/server/market/audience-scale";
import {
  hasArtistControversySubjectContext,
  hasArtistReleaseSubjectContext,
  isLowValueMarketArticleTitle,
  isUncorroboratedLowTierMarketClaim
} from "@/server/market/artist-event-disambiguation";
import {
  buildEventMarketSignals,
  flattenEvents,
  mergeEvents,
  normalizeManualMarketEvents,
  type ManualMarketEvents
} from "@/server/market/event-signals";
import {
  classifyArticleEvent,
  collectGdeltMarketSignals,
  normalizeDomain
} from "@/server/market/gdelt-source";
import { collectLastfmMarketSignals } from "@/server/market/lastfm-source";
import { collectListenBrainzMarketSignals } from "@/server/market/listenbrainz-source";
import { collectMusicbrainzReleaseEvents } from "@/server/market/musicbrainz-releases";
import { collectRedditMarketSignals } from "@/server/market/reddit-source";
import { collectSpotifyMarketSignals } from "@/server/market/spotify-source";
import { collectTradeFlowMarketSignals } from "@/server/market/trade-flow-source";
import { collectWikimediaMarketSignals } from "@/server/market/wikimedia-source";
import { collectYoutubeMarketSignals } from "@/server/market/youtube-source";
import { collectYoutubeCommentMarketSignals } from "@/server/market/youtube-comments-source";
import { collectYoutubeUploadEvents } from "@/server/market/youtube-upload-events-source";
import { getMarketDate } from "@/server/market/market-date";
import { getMarketModelVersion } from "@/server/market/model-version";
import { getMockMarketArtists } from "@/server/market/mock-source";
import type {
  AdapterSignals,
  ArtistExternalIds,
  MarketEvent,
  MarketObservation,
  ObservationBaselines
} from "@/server/market/market-data";
import {
  loadActiveArtists,
  loadActiveArtistCount,
  loadActiveArtistsPage,
  loadArtistExternalIds,
  loadExistingPriceHistoryArtistIds,
  loadObservationBaselines,
  loadPreviousClosePrices,
  loadPreviousSignalStats,
  loadPriceTrendContexts,
  loadRecentMarketEvents,
  persistMarketEvents,
  persistMarketObservations,
  persistMarketUpdates
} from "@/server/market/supabase-repository";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

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

const DEFAULT_LIVE_REAL_SOURCE_BATCH_SIZE = 100;
const MAX_ARTIST_BATCH_SIZE = 100;

export async function GET(request: Request) {
  const auth = await requireAdminRequest(request);

  if (!auth.ok) {
    return auth.response;
  }

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
  const runDate = body.runDate ?? getMarketDate();
  const config = getSupabaseConfigStatus();
  const auth = await requireAdminRequest(request, { allowMarketSecret: true });

  if (!auth.ok) {
    return auth.response;
  }

  if (!dryRun) {
    if (auth.source !== "market-secret") {
      return NextResponse.json(
        {
          ok: false,
          error: "Persisted market updates require the market update secret."
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
    let { artists, batch } = await loadArtistBatch({
      source,
      supabase,
      dryRun,
      artistLimit: body.artistLimit,
      artistOffset: body.artistOffset
    });

    if (supabase && isRealExternalSource(source)) {
      artists = await applyMarketHistoryBaselines({
        supabase,
        artists,
        runDate
      });
    }

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
      seedDetectedEventsByArtist: realSignals.detectedEventsByArtist,
      manualEvents: body.manualEvents
    });
    const modelVersion = getMarketModelVersion();
    const adapterSignals = attachAudienceScaleCalibration({
      artists,
      signals: mergeAdapterSignals(...realSignals.adapterSignalSources, eventSignals.adapterSignals),
      snapshots: realSignals.audienceScaleSnapshots
    });
    const warnings = [
      ...realSignals.warnings,
      ...eventSignals.warnings
    ];
    const result = calculateDailyMarketUpdates({
      artists,
      runDate,
      source,
      modelVersion,
      manualSignals: sanitizeManualSignals(body.manualSignals),
      adapterSignals,
      marketCoverageRatio: getMarketCoverageRatio(batch)
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
    source === "mock" ||
    source === "manual" ||
    source === "gdelt" ||
    source === "lastfm" ||
    source === "spotify" ||
    source === "youtube" ||
    source === "wikimedia" ||
    source === "reddit" ||
    source === "bluesky" ||
    source === "core" ||
    source === "blended"
  ) {
    return source;
  }

  return "core";
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

  if (!supabase || source === "mock" || (dryRun && !isRealExternalSource(source))) {
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
    source === "wikimedia" ||
    source === "reddit" ||
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

function getMarketCoverageRatio(batch: NonNullable<MarketUpdateSummary["batch"]>) {
  if (batch.totalArtists <= 0) {
    return 1;
  }

  return Math.min(1, Math.max(0, batch.artistCount / batch.totalArtists));
}

async function applyMarketHistoryBaselines({
  supabase,
  artists,
  runDate
}: {
  supabase: ReturnType<typeof createServiceRoleClient>;
  artists: ReturnType<typeof getMockMarketArtists>;
  runDate: string;
}) {
  const artistIds = artists.map((artist) => artist.id);
  const [previousCloses, priceTrends, existingPriceHistoryArtistIds, previousSignalStats] = await Promise.all([
    loadPreviousClosePrices({
      supabase,
      artistIds,
      runDate
    }),
    loadPriceTrendContexts({
      supabase,
      artistIds,
      runDate
    }),
    loadExistingPriceHistoryArtistIds({
      supabase,
      artistIds,
      runDate
    }),
    loadPreviousSignalStats({
      supabase,
      artistIds,
      runDate
    })
  ]);

  return artists.map((artist) => {
    const previousClose = previousCloses[artist.id];
    const priceTrend = priceTrends[artist.id];
    const isSameDayRecalculation = existingPriceHistoryArtistIds.has(artist.id);

    if (previousClose === undefined || !Number.isFinite(previousClose) || previousClose <= 0) {
      return {
        ...artist,
        priceTrend
      };
    }

    return {
      ...artist,
      currentPrice: isSameDayRecalculation ? previousClose : artist.currentPrice,
      previousClose,
      previousCloseSource: "price_history" as const,
      stats: isSameDayRecalculation ? previousSignalStats[artist.id] ?? artist.stats : artist.stats,
      priceTrend
    };
  });
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
  detectedEventsByArtist: Record<string, MarketEvent[]>;
  audienceScaleSnapshots: AudienceScaleSnapshots;
}> {
  const useGdelt = source === "gdelt" || source === "blended";
  const useLastfm =
    getEnvBoolean("MARKET_LASTFM_ENABLED", true) &&
    (source === "lastfm" || source === "core" || source === "blended");
  const useListenBrainz = source === "lastfm" || source === "core" || source === "blended";
  const useSpotify =
    source === "spotify" || ((source === "core" || source === "blended") && hasSpotifyCredentials());
  const useYoutube = source === "youtube" || source === "core" || source === "blended";
  const useWikimedia = source === "wikimedia" || source === "core" || source === "blended";
  const useReddit = source === "reddit" || ((source === "core" || source === "blended") && hasRedditCredentials());
  const useBluesky =
    source === "bluesky" || ((source === "core" || source === "blended") && getEnvBoolean("MARKET_BLUESKY_ENABLED", false));
  const useTradeFlow = Boolean(supabase) && isRealExternalSource(source);
  const warnings: string[] = [];

  if (
    !useGdelt &&
    !useLastfm &&
    !useListenBrainz &&
    !useSpotify &&
    !useYoutube &&
    !useWikimedia &&
    !useReddit &&
    !useBluesky
  ) {
    return {
      adapterSignalSources: [],
      observations: [],
      warnings: [],
      externalIds: {},
      detectedEventsByArtist: {},
      audienceScaleSnapshots: {}
    };
  }

  const artistIds = artists.map((artist) => artist.id);
  let externalIds: Record<string, ArtistExternalIds> = {};
  let gdeltBaselines: ObservationBaselines = {};
  let lastfmBaselines: ObservationBaselines = {};
  let listenbrainzBaselines: ObservationBaselines = {};
  let spotifyBaselines: ObservationBaselines = {};
  let youtubeBaselines: ObservationBaselines = {};
  let youtubeCommentBaselines: ObservationBaselines = {};
  let wikimediaBaselines: ObservationBaselines = {};
  let redditBaselines: ObservationBaselines = {};
  let blueskyBaselines: ObservationBaselines = {};

  if (supabase) {
    try {
      [
        externalIds,
        gdeltBaselines,
        lastfmBaselines,
        listenbrainzBaselines,
        spotifyBaselines,
        youtubeBaselines,
        youtubeCommentBaselines,
        wikimediaBaselines,
        redditBaselines,
        blueskyBaselines
      ] = await Promise.all([
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
              lookbackDays: 30,
              strategy: "latest"
            })
          : Promise.resolve({}),
        useListenBrainz
          ? loadObservationBaselines({
              supabase,
              artistIds,
              source: "listenbrainz",
              metrics: ["listen_count", "listener_count"],
              beforeDate: runDate,
              lookbackDays: 30,
              strategy: "latest"
            })
          : Promise.resolve({}),
        useSpotify
          ? loadObservationBaselines({
              supabase,
              artistIds,
              source: "spotify",
              metrics: ["popularity", "followers_total"],
              beforeDate: runDate,
              lookbackDays: 30,
              strategy: "latest"
            })
          : Promise.resolve({}),
        useYoutube
          ? loadObservationBaselines({
              supabase,
              artistIds,
              source: "youtube",
              metrics: ["channel_views", "subscriber_count", "video_count"],
              beforeDate: runDate,
              lookbackDays: 30,
              strategy: "latest"
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
          : Promise.resolve({}),
        useWikimedia
          ? loadObservationBaselines({
              supabase,
              artistIds,
              source: "wikimedia",
              metrics: ["pageviews_7d"],
              beforeDate: runDate,
              lookbackDays: 30
            })
          : Promise.resolve({}),
        useReddit
          ? loadObservationBaselines({
              supabase,
              artistIds,
              source: "reddit",
              metrics: ["post_count", "engagement_score", "hype_post_count", "negative_post_count"],
              beforeDate: runDate,
              lookbackDays: 30
            })
          : Promise.resolve({}),
        useBluesky
          ? loadObservationBaselines({
              supabase,
              artistIds,
              source: "bluesky",
              metrics: ["post_count", "engagement_score", "hype_post_count", "negative_post_count"],
              beforeDate: runDate,
              lookbackDays: 30
            })
          : Promise.resolve({})
      ]);
    } catch (error) {
      warnings.push(`Market baseline lookup skipped: ${getErrorMessage(error)}`);
      externalIds = {};
      gdeltBaselines = {};
      lastfmBaselines = {};
      listenbrainzBaselines = {};
      spotifyBaselines = {};
      youtubeBaselines = {};
      youtubeCommentBaselines = {};
      wikimediaBaselines = {};
      redditBaselines = {};
      blueskyBaselines = {};
    }
  }

  const sources: AdapterSignals[] = [];
  const observations: MarketObservation[] = [];
  let detectedEventsByArtist: Record<string, MarketEvent[]> = {};
  const sourceTasks: Array<Promise<void>> = [];

  if (useGdelt) {
    sourceTasks.push((async () => {
      const gdelt = await collectExternalSource("GDELT news", warnings, () =>
        collectGdeltMarketSignals({
          artists,
          runDate,
          externalIds,
          baselines: gdeltBaselines
        })
      );

      if (gdelt) {
        sources.push(gdelt.signals);
        observations.push(...gdelt.observations);
        warnings.push(...gdelt.warnings);
        detectedEventsByArtist = mergeEvents(detectedEventsByArtist, gdelt.eventsByArtist);
      }
    })());
  }

  if (useLastfm) {
    sourceTasks.push((async () => {
      const lastfm = await collectExternalSource("Last.fm", warnings, () =>
        collectLastfmMarketSignals({
          artists,
          runDate,
          apiKey: process.env.LASTFM_API_KEY,
          externalIds,
          baselines: lastfmBaselines
        })
      );

      if (lastfm) {
        sources.push(lastfm.signals);
        observations.push(...lastfm.observations);
        warnings.push(...lastfm.warnings);
      }
    })());
  }

  if (useListenBrainz) {
    sourceTasks.push((async () => {
      const listenbrainz = await collectExternalSource("ListenBrainz", warnings, () =>
        collectListenBrainzMarketSignals({
          artists,
          runDate,
          externalIds,
          authToken: process.env.LISTENBRAINZ_USER_TOKEN,
          baselines: listenbrainzBaselines
        })
      );

      if (listenbrainz) {
        sources.push(listenbrainz.signals);
        observations.push(...listenbrainz.observations);
        warnings.push(...listenbrainz.warnings);
      }
    })());
  }

  if (useSpotify) {
    sourceTasks.push((async () => {
      const spotify = await collectExternalSource("Spotify", warnings, () =>
        collectSpotifyMarketSignals({
          artists,
          runDate,
          credentials: {
            clientId: process.env.SPOTIFY_CLIENT_ID,
            clientSecret: process.env.SPOTIFY_CLIENT_SECRET
          },
          externalIds,
          baselines: spotifyBaselines
        })
      );

      if (spotify) {
        sources.push(spotify.signals);
        observations.push(...spotify.observations);
        warnings.push(...spotify.warnings);
      }
    })());
  }

  if (useYoutube) {
    sourceTasks.push((async () => {
      const youtube = await collectExternalSource("YouTube channel", warnings, () =>
        collectYoutubeMarketSignals({
          artists,
          runDate,
          apiKey: process.env.YOUTUBE_API_KEY,
          externalIds,
          baselines: youtubeBaselines
        })
      );

      if (youtube) {
        sources.push(youtube.signals);
        observations.push(...youtube.observations);
        warnings.push(...youtube.warnings);
      }

      const maxUploadEventVideos = getEnvInteger("MARKET_YOUTUBE_UPLOAD_EVENT_VIDEOS", 12, 0, 12);

      if (maxUploadEventVideos > 0) {
        const youtubeUploadEvents = await collectExternalSource("YouTube upload events", warnings, () =>
          collectYoutubeUploadEvents({
            artists,
            runDate,
            apiKey: process.env.YOUTUBE_API_KEY,
            externalIds,
            maxVideosPerArtist: maxUploadEventVideos,
            lookbackDays: getEnvInteger("MARKET_YOUTUBE_UPLOAD_EVENT_DAYS", 14, 1, 45)
          })
        );

        if (youtubeUploadEvents) {
          observations.push(...youtubeUploadEvents.observations);
          warnings.push(...youtubeUploadEvents.warnings);
          detectedEventsByArtist = mergeEvents(detectedEventsByArtist, youtubeUploadEvents.eventsByArtist);
        }
      }

      const maxVideosPerArtist = getEnvInteger("MARKET_YOUTUBE_COMMENT_VIDEOS", 1, 0, 3);

      if (maxVideosPerArtist > 0) {
        const youtubeComments = await collectExternalSource("YouTube comments", warnings, () =>
          collectYoutubeCommentMarketSignals({
            artists,
            runDate,
            apiKey: process.env.YOUTUBE_API_KEY,
            externalIds,
            baselines: youtubeCommentBaselines,
            maxVideosPerArtist,
            maxCommentsPerVideo: getEnvInteger("MARKET_YOUTUBE_COMMENT_LIMIT", 25, 1, 100)
          })
        );

        if (youtubeComments) {
          sources.push(youtubeComments.signals);
          observations.push(...youtubeComments.observations);
          warnings.push(...youtubeComments.warnings);
        }
      }
    })());
  }

  if (useWikimedia) {
    sourceTasks.push((async () => {
      const wikimedia = await collectExternalSource("public attention", warnings, () =>
        collectWikimediaMarketSignals({
          artists,
          runDate,
          externalIds,
          baselines: wikimediaBaselines
        })
      );

      if (wikimedia) {
        sources.push(wikimedia.signals);
        observations.push(...wikimedia.observations);
        warnings.push(...wikimedia.warnings);
      }
    })());
  }

  if (useReddit) {
    sourceTasks.push((async () => {
      const reddit = await collectExternalSource("Reddit community hype", warnings, () =>
        collectRedditMarketSignals({
          artists,
          runDate,
          credentials: {
            clientId: process.env.REDDIT_CLIENT_ID,
            clientSecret: process.env.REDDIT_CLIENT_SECRET,
            userAgent: process.env.REDDIT_USER_AGENT
          },
          externalIds,
          baselines: redditBaselines,
          subreddits: getEnvList("MARKET_REDDIT_SUBREDDITS"),
          postsPerArtist: getEnvInteger("MARKET_REDDIT_POST_LIMIT", 25, 5, 100),
          lookbackDays: getEnvInteger("MARKET_REDDIT_LOOKBACK_DAYS", 7, 1, 30)
        })
      );

      if (reddit) {
        sources.push(reddit.signals);
        observations.push(...reddit.observations);
        warnings.push(...reddit.warnings);
        detectedEventsByArtist = mergeEvents(detectedEventsByArtist, reddit.eventsByArtist);
      }
    })());
  }

  if (useBluesky) {
    sourceTasks.push((async () => {
      const bluesky = await collectExternalSource("Bluesky social chatter", warnings, () =>
        collectBlueskyMarketSignals({
          artists,
          runDate,
          externalIds,
          baselines: blueskyBaselines,
          postsPerArtist: getEnvInteger("MARKET_BLUESKY_POST_LIMIT", 20, 5, 100),
          lookbackDays: getEnvInteger("MARKET_BLUESKY_LOOKBACK_DAYS", 7, 1, 30),
          delayMs: getEnvInteger("MARKET_BLUESKY_DELAY_MS", 250, 0, 2000)
        })
      );

      if (bluesky) {
        sources.push(bluesky.signals);
        observations.push(...bluesky.observations);
        warnings.push(...bluesky.warnings);
        detectedEventsByArtist = mergeEvents(detectedEventsByArtist, bluesky.eventsByArtist);
      }
    })());
  }

  if (useTradeFlow && supabase) {
    sourceTasks.push((async () => {
      const tradeFlow = await collectExternalSource("trade flow", warnings, () =>
        collectTradeFlowMarketSignals({
          supabase,
          artists,
          runDate
        })
      );

      if (tradeFlow) {
        sources.push(tradeFlow.signals);
        observations.push(...tradeFlow.observations);
        warnings.push(...tradeFlow.warnings);
      }
    })());
  }

  await Promise.all(sourceTasks);

  return {
    adapterSignals: mergeAdapterSignals(...sources),
    adapterSignalSources: sources,
    observations,
    warnings,
    externalIds,
    detectedEventsByArtist,
    audienceScaleSnapshots: buildAudienceScaleSnapshots({
      artists,
      lastfmBaselines,
      youtubeBaselines,
      wikimediaBaselines
    })
  };
}

function buildAudienceScaleSnapshots({
  artists,
  lastfmBaselines,
  youtubeBaselines,
  wikimediaBaselines
}: {
  artists: ReturnType<typeof getMockMarketArtists>;
  lastfmBaselines: ObservationBaselines;
  youtubeBaselines: ObservationBaselines;
  wikimediaBaselines: ObservationBaselines;
}): AudienceScaleSnapshots {
  return Object.fromEntries(
    artists.map((artist) => {
      const lastfm = lastfmBaselines[artist.id] ?? {};
      const youtube = youtubeBaselines[artist.id] ?? {};
      const wikimedia = wikimediaBaselines[artist.id] ?? {};

      return [
        artist.id,
        {
          lastfm: {
            listeners: getPositiveBaseline(lastfm.listeners),
            playcount: getPositiveBaseline(lastfm.playcount)
          },
          youtube: {
            subscriberCount: getPositiveBaseline(youtube.subscriber_count),
            viewCount: getPositiveBaseline(youtube.channel_views)
          },
          wikimedia: {
            pageviews7d: getPositiveBaseline(wikimedia.pageviews_7d)
          }
        }
      ];
    })
  );
}

function getPositiveBaseline(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function hasSpotifyCredentials() {
  return Boolean(process.env.SPOTIFY_CLIENT_ID?.trim() && process.env.SPOTIFY_CLIENT_SECRET?.trim());
}

function hasRedditCredentials() {
  return Boolean(
    process.env.REDDIT_CLIENT_ID?.trim() &&
      process.env.REDDIT_CLIENT_SECRET?.trim() &&
      process.env.REDDIT_USER_AGENT?.trim()
  );
}

async function collectExternalSource<T>(
  label: string,
  warnings: string[],
  collect: () => Promise<T>
): Promise<T | null> {
  try {
    return await collect();
  } catch (error) {
    warnings.push(`${label} signals skipped after an API error: ${getErrorMessage(error)}`);
    return null;
  }
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

  if (["1", "true", "yes", "on"].includes(value)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(value)) {
    return false;
  }

  return fallback;
}

function getEnvList(name: string) {
  const values = (process.env[name] ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return values.length ? values : undefined;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

async function collectEventSignals({
  source,
  artists,
  runDate,
  supabase,
  dryRun,
  externalIds,
  seedDetectedEventsByArtist = {},
  manualEvents
}: {
  source: MarketUpdateSource;
  artists: ReturnType<typeof getMockMarketArtists>;
  runDate: string;
  supabase: ReturnType<typeof createServiceRoleClient> | null;
  dryRun: boolean;
  externalIds: Record<string, ArtistExternalIds>;
  seedDetectedEventsByArtist?: Record<string, MarketEvent[]>;
  manualEvents?: ManualMarketEvents;
}) {
  const artistIds = artists.map((artist) => artist.id);
  let storedEvents = {};
  let detectedEventsByArtist = seedDetectedEventsByArtist;
  const warnings: string[] = [];

  if (supabase) {
    try {
      storedEvents = await loadRecentMarketEvents({
        supabase,
        artistIds,
        runDate,
        lookbackDays: 30
      });
      storedEvents = filterStoredEventsForSourcePolicy(storedEvents, source, artists);
    } catch (error) {
      if (!dryRun) {
        throw error;
      }
    }
  }

  if (
    (source === "core" || source === "blended") &&
    supabase &&
    getEnvBoolean("MARKET_MUSICBRAINZ_RELEASES_ENABLED", false)
  ) {
    const releaseEvents = await collectMusicbrainzReleaseEvents({
      artists,
      runDate,
      externalIds
    });

    detectedEventsByArtist = mergeEvents(detectedEventsByArtist, releaseEvents.eventsByArtist);
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

function filterStoredEventsForSourcePolicy(
  eventsByArtist: Record<string, MarketEvent[]>,
  source: MarketUpdateSource,
  artists: ReturnType<typeof getMockMarketArtists>
) {
  const allowBluesky =
    source === "bluesky" || ((source === "core" || source === "blended") && getEnvBoolean("MARKET_BLUESKY_ENABLED", false));
  const artistById = new Map(artists.map((artist) => [artist.id, artist]));

  return Object.fromEntries(
    Object.entries(eventsByArtist)
      .map(([artistId, events]) => [
        artistId,
        events.filter((event) => {
          const eventSource = typeof event.rawPayload.source === "string" ? event.rawPayload.source : "";

          if (!allowBluesky && eventSource === "bluesky_post") {
            return false;
          }

          return isStoredEventEligibleForPricing(event, artistById.get(artistId));
        })
      ])
      .filter(([, events]) => events.length > 0)
  );
}

function isStoredEventEligibleForPricing(
  event: MarketEvent,
  artist: ReturnType<typeof getMockMarketArtists>[number] | undefined
) {
  const eventSource = typeof event.rawPayload.source === "string" ? event.rawPayload.source : "";

  if (eventSource === "musicbrainz_release_group") {
    return event.rawPayload.corroborated === true;
  }

  if ((eventSource !== "media_rss_item" && eventSource !== "gdelt_article") || !artist) {
    return true;
  }

  if (isLowValueMarketArticleTitle(event.title)) {
    return false;
  }

  const domain =
    (typeof event.rawPayload.domain === "string" ? event.rawPayload.domain : "") ||
    normalizeDomain(undefined, event.sourceUrl) ||
    "";
  const classification = classifyArticleEvent(event.title, domain, undefined, {
    allowLowTierRelease: true
  });
  const storedReason =
    typeof event.rawPayload.classificationReason === "string"
      ? event.rawPayload.classificationReason
      : "";
  const sourceTier =
    typeof event.rawPayload.sourceTier === "number" && Number.isFinite(event.rawPayload.sourceTier)
      ? event.rawPayload.sourceTier
      : 0;
  const corroboratingSourceCount =
    typeof event.rawPayload.corroboratingSourceCount === "number" &&
    Number.isFinite(event.rawPayload.corroboratingSourceCount)
      ? event.rawPayload.corroboratingSourceCount
      : 0;

  if (
    !classification ||
    classification.eventType !== event.eventType ||
    (storedReason && classification.reason !== storedReason)
  ) {
    return false;
  }

  if (
    isUncorroboratedLowTierMarketClaim({
      sourceTier,
      classificationReason: classification.reason,
      corroborated: event.rawPayload.corroborated === true,
      corroboratingSourceCount
    })
  ) {
    return false;
  }

  const query =
    typeof event.rawPayload.searchQuery === "string"
      ? event.rawPayload.searchQuery
      : undefined;

  if (classification.reason === "release_terms") {
    return hasArtistReleaseSubjectContext({
      artistName: artist.name,
      text: event.title,
      query
    });
  }

  if (classification.reason === "controversy_terms") {
    return hasArtistControversySubjectContext({
      artistName: artist.name,
      text: event.title,
      query
    });
  }

  return true;
}
