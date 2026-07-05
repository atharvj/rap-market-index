import type { MarketUpdateArtist } from "@/server/market/daily-update";
import type { ArtistExternalIds, MarketEvent, MarketObservation } from "@/server/market/market-data";

type YoutubeUploadEventOptions = {
  artists: MarketUpdateArtist[];
  runDate: string;
  apiKey?: string;
  externalIds?: Record<string, ArtistExternalIds>;
  maxVideosPerArtist?: number;
  lookbackDays?: number;
  delayMs?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

type YoutubeChannelResource = {
  id?: string;
  contentDetails?: {
    relatedPlaylists?: {
      uploads?: string;
    };
  };
};

type YoutubeChannelListResponse = {
  items?: YoutubeChannelResource[];
  error?: {
    message?: string;
  };
};

type YoutubePlaylistItemsResponse = {
  items?: Array<{
    snippet?: {
      title?: string;
      publishedAt?: string;
      resourceId?: {
        videoId?: string;
      };
    };
    contentDetails?: {
      videoId?: string;
    };
  }>;
  error?: {
    message?: string;
  };
};

type YoutubeVideo = {
  id: string;
  title: string;
  publishedAt?: string;
};

type YoutubeUploadClassification = {
  eventType: MarketEvent["eventType"];
  sentimentScore: number;
  impactScore: number;
  confidence: number;
  reason: string;
};

export type YoutubeUploadEventSignals = {
  eventsByArtist: Record<string, MarketEvent[]>;
  observations: MarketObservation[];
  warnings: string[];
};

const SOURCE = "youtube_uploads";
const RECENT_VIDEO_COUNT = "recent_video_count";
const EVENT_VIDEO_COUNT = "event_video_count";
const LATEST_UPLOAD_AGE_DAYS = "latest_upload_age_days";
const REQUEST_ERROR = "request_error";
const MAX_CHANNELS_PER_REQUEST = 50;

export async function collectYoutubeUploadEvents({
  artists,
  runDate,
  apiKey,
  externalIds = {},
  maxVideosPerArtist = 2,
  lookbackDays = 14,
  delayMs = 250,
  timeoutMs = 10000,
  fetchImpl = fetch
}: YoutubeUploadEventOptions): Promise<YoutubeUploadEventSignals> {
  const cleanApiKey = apiKey?.trim();

  if (!cleanApiKey || maxVideosPerArtist <= 0) {
    return {
      eventsByArtist: {},
      observations: [],
      warnings: cleanApiKey ? [] : ["YOUTUBE_API_KEY is not configured; skipped YouTube upload event detection."]
    };
  }

  const eventsByArtist: Record<string, MarketEvent[]> = {};
  const observations: MarketObservation[] = [];
  const warnings: string[] = [];
  const channelLookups = artists.flatMap((artist) => {
    const channelId = normalizeYoutubeChannelId(externalIds[artist.id]?.youtubeChannelId);

    return channelId ? [{ artist, channelId }] : [];
  });

  if (!channelLookups.length) {
    return {
      eventsByArtist,
      observations,
      warnings: [`YouTube upload events skipped ${artists.length} artist(s) without youtube_channel_id.`]
    };
  }

  const playlists = await fetchYoutubeUploadPlaylists({
    apiKey: cleanApiKey,
    channelIds: channelLookups.map((lookup) => lookup.channelId),
    timeoutMs,
    delayMs,
    fetchImpl
  });

  if (!playlists.ok) {
    return {
      eventsByArtist,
      observations: channelLookups.map((lookup) =>
        createErrorObservation(lookup.artist.id, runDate, playlists.error, { channelId: lookup.channelId })
      ),
      warnings: [playlists.error]
    };
  }

  for (const [index, lookup] of channelLookups.entries()) {
    if (index > 0 && delayMs > 0) {
      await sleep(delayMs);
    }

    const uploadPlaylistId = playlists.playlists[lookup.channelId];

    if (!uploadPlaylistId) {
      const error = "YouTube uploads playlist was not found for this artist channel.";
      observations.push(createErrorObservation(lookup.artist.id, runDate, error, { channelId: lookup.channelId }));
      continue;
    }

    const videos = await fetchRecentUploadedVideos({
      apiKey: cleanApiKey,
      playlistId: uploadPlaylistId,
      maxResults: maxVideosPerArtist,
      timeoutMs,
      fetchImpl
    });

    if (!videos.ok) {
      observations.push(
        createErrorObservation(lookup.artist.id, runDate, videos.error, {
          channelId: lookup.channelId,
          uploadPlaylistId
        })
      );
      warnings.push(`${lookup.artist.ticker}: ${videos.error}`);
      continue;
    }

    const freshVideos = videos.videos.filter((video) => isWithinLookback(video.publishedAt, runDate, lookbackDays));
    const events = buildYoutubeUploadEvents({
      artist: lookup.artist,
      runDate,
      channelId: lookup.channelId,
      videos: freshVideos
    });

    if (events.length) {
      eventsByArtist[lookup.artist.id] = events;
    }

    observations.push(
      createObservation(lookup.artist.id, runDate, RECENT_VIDEO_COUNT, freshVideos.length, "videos", {
        source: SOURCE,
        channelId: lookup.channelId,
        uploadPlaylistId,
        sampledVideoCount: videos.videos.length,
        recentVideoCount: freshVideos.length,
        lookbackDays,
        videoIds: freshVideos.map((video) => video.id)
      }),
      createObservation(lookup.artist.id, runDate, EVENT_VIDEO_COUNT, events.length, "videos", {
        source: SOURCE,
        channelId: lookup.channelId,
        uploadPlaylistId,
        eventVideoCount: events.length,
        lookbackDays
      })
    );

    const latestUploadAge = getLatestUploadAgeDays(freshVideos, runDate);

    if (typeof latestUploadAge === "number") {
      observations.push(
        createObservation(lookup.artist.id, runDate, LATEST_UPLOAD_AGE_DAYS, latestUploadAge, "days", {
          source: SOURCE,
          channelId: lookup.channelId,
          uploadPlaylistId,
          lookbackDays
        })
      );
    }
  }

  return {
    eventsByArtist,
    observations,
    warnings:
      channelLookups.length === artists.length
        ? warnings
        : [
            ...warnings,
            `YouTube upload events skipped ${artists.length - channelLookups.length} artist(s) without youtube_channel_id.`
          ]
  };
}

function buildYoutubeUploadEvents({
  artist,
  runDate,
  channelId,
  videos
}: {
  artist: MarketUpdateArtist;
  runDate: string;
  channelId: string;
  videos: YoutubeVideo[];
}) {
  const events: MarketEvent[] = [];

  for (const video of videos) {
    const classification = classifyYoutubeUploadTitle(video.title);

    if (!classification) {
      continue;
    }

    events.push({
      artistId: artist.id,
      eventDate: parseDate(video.publishedAt) ?? runDate,
      eventType: classification.eventType,
      title: video.title.slice(0, 160),
      sourceName: "YouTube",
      sourceUrl: `https://www.youtube.com/watch?v=${video.id}`,
      sentimentScore: classification.sentimentScore,
      impactScore: classification.impactScore,
      confidence: classification.confidence,
      rawPayload: {
        source: "youtube_upload_event",
        channelId,
        videoId: video.id,
        publishedAt: video.publishedAt ?? null,
        classificationReason: classification.reason
      }
    });
  }

  return events;
}

function classifyYoutubeUploadTitle(title: string): YoutubeUploadClassification | null {
  const normalized = normalizeTitle(title);

  if (!normalized) {
    return null;
  }

  const hasAlbumSignal = hasAny(normalized, ALBUM_ANNOUNCEMENT_TERMS);
  const hasSingleSignal = hasAny(normalized, SINGLE_RELEASE_TERMS);
  const hasOfficialVideoSignal = hasAny(normalized, OFFICIAL_VIDEO_TERMS);
  const hasSnippetSignal = hasAny(normalized, SNIPPET_TERMS);
  const hasTourSignal = hasAny(normalized, TOUR_TERMS);
  const hasPerformanceSignal = hasAny(normalized, PERFORMANCE_TERMS);
  const hasStrongMusicSignal =
    hasAlbumSignal || hasSingleSignal || hasOfficialVideoSignal || hasSnippetSignal || hasPerformanceSignal;

  if (hasAny(normalized, LOW_SIGNAL_TERMS) && !hasStrongMusicSignal) {
    return null;
  }

  if (hasTourSignal) {
    return {
      eventType: "tour",
      sentimentScore: 25,
      impactScore: 32,
      confidence: 0.72,
      reason: "tour_upload_title"
    };
  }

  if (hasAlbumSignal) {
    return {
      eventType: "release",
      sentimentScore: 32,
      impactScore: 55,
      confidence: 0.78,
      reason: "album_announcement_upload_title"
    };
  }

  if (hasSingleSignal || hasOfficialVideoSignal) {
    return {
      eventType: "release",
      sentimentScore: 26,
      impactScore: hasOfficialVideoSignal ? 44 : 38,
      confidence: 0.74,
      reason: hasOfficialVideoSignal ? "official_video_upload_title" : "single_upload_title"
    };
  }

  if (hasSnippetSignal) {
    return {
      eventType: "viral",
      sentimentScore: 18,
      impactScore: 28,
      confidence: 0.6,
      reason: "snippet_upload_title"
    };
  }

  if (hasPerformanceSignal) {
    return {
      eventType: "viral",
      sentimentScore: 16,
      impactScore: 24,
      confidence: 0.58,
      reason: "performance_upload_title"
    };
  }

  return null;
}

async function fetchYoutubeUploadPlaylists({
  apiKey,
  channelIds,
  timeoutMs,
  delayMs,
  fetchImpl
}: {
  apiKey: string;
  channelIds: string[];
  timeoutMs: number;
  delayMs: number;
  fetchImpl: typeof fetch;
}): Promise<{ ok: true; playlists: Record<string, string> } | { ok: false; error: string }> {
  const playlists: Record<string, string> = {};

  for (const [index, chunk] of chunkItems(channelIds, MAX_CHANNELS_PER_REQUEST).entries()) {
    if (index > 0 && delayMs > 0) {
      await sleep(delayMs);
    }

    const url = new URL("https://www.googleapis.com/youtube/v3/channels");

    url.searchParams.set("part", "contentDetails");
    url.searchParams.set("id", chunk.join(","));
    url.searchParams.set("key", apiKey);

    const result = await fetchJson({
      url: url.toString(),
      timeoutMs,
      fetchImpl
    });

    if (!result.ok) {
      return result;
    }

    const parsed = result.value as YoutubeChannelListResponse;

    for (const item of parsed.items ?? []) {
      if (item.id && item.contentDetails?.relatedPlaylists?.uploads) {
        playlists[item.id] = item.contentDetails.relatedPlaylists.uploads;
      }
    }
  }

  return {
    ok: true,
    playlists
  };
}

async function fetchRecentUploadedVideos({
  apiKey,
  playlistId,
  maxResults,
  timeoutMs,
  fetchImpl
}: {
  apiKey: string;
  playlistId: string;
  maxResults: number;
  timeoutMs: number;
  fetchImpl: typeof fetch;
}): Promise<{ ok: true; videos: YoutubeVideo[] } | { ok: false; error: string }> {
  const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems");

  url.searchParams.set("part", "snippet,contentDetails");
  url.searchParams.set("playlistId", playlistId);
  url.searchParams.set("maxResults", String(clampInteger(maxResults, 1, 5)));
  url.searchParams.set("key", apiKey);

  const result = await fetchJson({
    url: url.toString(),
    timeoutMs,
    fetchImpl
  });

  if (!result.ok) {
    return result;
  }

  const parsed = result.value as YoutubePlaylistItemsResponse;
  const videos = (parsed.items ?? [])
    .map((item) => ({
      id: item.contentDetails?.videoId ?? item.snippet?.resourceId?.videoId ?? "",
      title: item.snippet?.title?.trim() ?? "",
      publishedAt: item.snippet?.publishedAt
    }))
    .filter((video) => Boolean(video.id && video.title));

  return {
    ok: true,
    videos
  };
}

async function fetchJson({
  url,
  timeoutMs,
  fetchImpl
}: {
  url: string;
  timeoutMs: number;
  fetchImpl: typeof fetch;
}): Promise<{ ok: true; value: unknown } | { ok: false; error: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      signal: controller.signal
    });
    const text = await response.text();

    if (!response.ok) {
      const parsed = tryParseJson(text) as { error?: { message?: string } } | null;

      return {
        ok: false,
        error: parsed?.error?.message ?? `YouTube upload request failed with ${response.status}.`
      };
    }

    try {
      return {
        ok: true,
        value: JSON.parse(text)
      };
    } catch {
      return {
        ok: false,
        error: text.slice(0, 220) || "YouTube uploads returned a non-JSON response."
      };
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "YouTube upload request failed."
    };
  } finally {
    clearTimeout(timeout);
  }
}

function createObservation(
  artistId: string,
  runDate: string,
  metric: string,
  value: number,
  unit: string,
  rawPayload: Record<string, unknown>
): MarketObservation {
  return {
    artistId,
    source: SOURCE,
    metric,
    observedDate: runDate,
    value,
    unit,
    rawPayload
  };
}

function createErrorObservation(
  artistId: string,
  runDate: string,
  error: string,
  rawPayload: Record<string, unknown>
): MarketObservation {
  return {
    artistId,
    source: SOURCE,
    metric: REQUEST_ERROR,
    observedDate: runDate,
    value: 1,
    unit: "flag",
    rawPayload: {
      ...rawPayload,
      error
    }
  };
}

function normalizeYoutubeChannelId(value: string | undefined) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return undefined;
  }

  const channelPathMatch = trimmed.match(/(?:youtube\.com\/channel\/)(UC[\w-]+)/i);

  if (channelPathMatch?.[1]) {
    return channelPathMatch[1];
  }

  return trimmed.startsWith("UC") ? trimmed : undefined;
}

function normalizeTitle(value: string) {
  return value
    .toLowerCase()
    .replace(/[\[\](){}]/g, " ")
    .replace(/[^a-z0-9/&.'! -]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isWithinLookback(publishedAt: string | undefined, runDate: string, lookbackDays: number) {
  const eventDate = parseDate(publishedAt);

  if (!eventDate) {
    return false;
  }

  const daysOld = daysBetween(eventDate, runDate);

  return daysOld >= 0 && daysOld <= lookbackDays;
}

function getLatestUploadAgeDays(videos: YoutubeVideo[], runDate: string) {
  const ages = videos
    .map((video) => parseDate(video.publishedAt))
    .filter((date): date is string => Boolean(date))
    .map((date) => daysBetween(date, runDate))
    .filter((age) => age >= 0);

  return ages.length ? Math.min(...ages) : undefined;
}

function parseDate(value: string | undefined) {
  return value && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
}

function daysBetween(start: string, end: string) {
  const startDate = new Date(`${start}T00:00:00.000Z`).getTime();
  const endDate = new Date(`${end}T00:00:00.000Z`).getTime();

  return Math.round((endDate - startDate) / 86400000);
}

function hasAny(value: string, terms: string[]) {
  return terms.some((term) => value.includes(term));
}

function clampInteger(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function tryParseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function chunkItems<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

const LOW_SIGNAL_TERMS = [
  "#shorts",
  "behind the scenes",
  "day in the life",
  "documentary",
  "episode",
  "full interview",
  "gaming",
  "interview",
  "podcast",
  "reaction",
  "recap",
  "stream highlights",
  "tour vlog",
  "shorts",
  "vlog"
];

const ALBUM_ANNOUNCEMENT_TERMS = [
  "album announcement",
  "album trailer",
  "album out now",
  "announces album",
  "announces mixtape",
  "cover art",
  "deluxe",
  "deluxe edition",
  "ep out now",
  "mixtape",
  "new album",
  "new ep",
  "new project",
  "pre-save",
  "pre save",
  "release date",
  "tracklist"
];

const SINGLE_RELEASE_TERMS = [
  "available now",
  "drops",
  "dropped",
  "full song",
  "listen now",
  "new single",
  "new song",
  "out now",
  "premiere",
  "released",
  "single",
  "stream now"
];

const OFFICIAL_VIDEO_TERMS = [
  "audio",
  "lyric video",
  "music video",
  "official audio",
  "official lyric video",
  "official video",
  "visualizer"
];

const SNIPPET_TERMS = [
  "coming soon",
  "demo",
  "first listen",
  "in the studio",
  "leak",
  "leaked",
  "new music",
  "preview",
  "song preview",
  "snippet",
  "teaser",
  "unreleased"
];

const TOUR_TERMS = [
  "announces tour",
  "presale",
  "tickets",
  "tour announcement",
  "tour dates",
  "world tour"
];

const PERFORMANCE_TERMS = [
  "acoustic",
  "freestyle",
  "live performance",
  "official live",
  "performance",
  "studio session"
];
