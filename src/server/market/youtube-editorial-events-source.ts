import type { MarketUpdateArtist } from "@/server/market/daily-update";
import type { MarketEvent, MarketObservation } from "@/server/market/market-data";

type YoutubeEditorialEventOptions = {
  artists: MarketUpdateArtist[];
  runDate: string;
  apiKey?: string;
  maxVideosPerChannel?: number;
  lookbackDays?: number;
  delayMs?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

type EditorialChannel = {
  name: string;
  channelId: string;
  uploadsPlaylistId: string;
  authority: "primary" | "established";
};

type YoutubeVideo = {
  id: string;
  title: string;
  description?: string | null;
  thumbnailUrl?: string | null;
  publishedAt?: string;
  durationSeconds?: number | null;
  viewCount?: number | null;
  likeCount?: number | null;
  commentCount?: number | null;
};

type EditorialClassification = {
  reason: "lyrics_interview" | "music_interview" | "music_documentary" | "editorial_performance";
  eventType: MarketEvent["eventType"];
  baseImpact: number;
};

export type YoutubeEditorialEventSignals = {
  eventsByArtist: Record<string, MarketEvent[]>;
  observations: MarketObservation[];
  warnings: string[];
};

const SOURCE = "youtube_editorial";
const DEFAULT_MAX_VIDEOS_PER_CHANNEL = 12;

// Channel IDs and upload playlists are resolved from each publisher's official YouTube handle.
// Keeping this list explicit prevents arbitrary creator videos from becoming market catalysts.
export const TRUSTED_YOUTUBE_EDITORIAL_CHANNELS: EditorialChannel[] = [
  channel("Genius", "UCyFZMEnm1il5Wv3a6tPscbA", "primary"),
  channel("The FADER", "UCRCOCvfOkoqneyQCbNOUPwg", "primary"),
  channel("Pitchfork", "UC7kI8WjpCfFoMSNDuRh_4lA", "primary"),
  channel("Complex", "UCE_--R1P5-kfBzHTca0dsnw", "primary"),
  channel("Billboard", "UCsVcseUYbYjldc-XgcsiEbg", "primary"),
  channel("NME", "UCiTFwf4VFGMyfg3cQlXP9JQ", "primary"),
  channel("On The Radar Radio", "UCa8b7nZo-iPKoJxspOplnWg", "established"),
  channel("COLORS", "UC2Qw1dzXDBAZPwS7zm37g8g", "established"),
  channel("Our Generation Music", "UCdBHXA53hAQ5u4qvU_l3C5g", "established")
];

export async function collectYoutubeEditorialEvents({
  artists,
  runDate,
  apiKey,
  maxVideosPerChannel = DEFAULT_MAX_VIDEOS_PER_CHANNEL,
  lookbackDays = 7,
  delayMs = 150,
  timeoutMs = 10000,
  fetchImpl = fetch
}: YoutubeEditorialEventOptions): Promise<YoutubeEditorialEventSignals> {
  const cleanApiKey = apiKey?.trim();
  const eventsByArtist: Record<string, MarketEvent[]> = {};
  const observations: MarketObservation[] = [];
  const warnings: string[] = [];

  if (!cleanApiKey || maxVideosPerChannel <= 0 || !artists.length) {
    return {
      eventsByArtist,
      observations,
      warnings: cleanApiKey ? [] : ["YOUTUBE_API_KEY is not configured; skipped editorial video detection."]
    };
  }

  for (const [index, publisher] of TRUSTED_YOUTUBE_EDITORIAL_CHANNELS.entries()) {
    if (index > 0 && delayMs > 0) {
      await sleep(delayMs);
    }

    const result = await fetchRecentUploadedVideos({
      apiKey: cleanApiKey,
      playlistId: publisher.uploadsPlaylistId,
      maxResults: maxVideosPerChannel,
      timeoutMs,
      fetchImpl
    });

    if (!result.ok) {
      warnings.push(`${publisher.name}: ${result.error}`);
      continue;
    }

    const freshVideos = result.videos.filter((video) => isWithinLookback(video.publishedAt, runDate, lookbackDays));
    const publisherEvents = buildYoutubeEditorialEvents({ artists, runDate, publisher, videos: freshVideos });

    for (const event of publisherEvents) {
      eventsByArtist[event.artistId] = [...(eventsByArtist[event.artistId] ?? []), event];
    }
  }

  for (const artist of artists) {
    const events = eventsByArtist[artist.id] ?? [];

    if (!events.length) {
      continue;
    }

    observations.push({
      artistId: artist.id,
      source: SOURCE,
      metric: "music_editorial_video_count",
      observedDate: runDate,
      value: events.length,
      unit: "videos",
      rawPayload: {
        source: SOURCE,
        lookbackDays,
        publisherCount: new Set(events.map((event) => event.sourceName)).size,
        videoIds: events.map((event) => event.rawPayload.videoId)
      }
    });
  }

  return { eventsByArtist, observations, warnings };
}

export function buildYoutubeEditorialEvents({
  artists,
  runDate,
  publisher,
  videos
}: {
  artists: MarketUpdateArtist[];
  runDate: string;
  publisher: EditorialChannel;
  videos: YoutubeVideo[];
}) {
  const events: MarketEvent[] = [];

  for (const video of videos) {
    if (isShortForm(video)) {
      continue;
    }

    const classification = classifyEditorialVideo(video);

    if (!classification) {
      continue;
    }

    const matchedArtists = matchEditorialVideoArtists(video, artists);

    for (const artist of matchedArtists) {
      const profile = getEditorialImpactProfile(video, artist, publisher, classification, runDate);

      if (!profile.accepted) {
        continue;
      }

      events.push({
        artistId: artist.id,
        eventDate: parseDate(video.publishedAt) ?? runDate,
        eventType: classification.eventType,
        title: video.title.slice(0, 160),
        sourceName: publisher.name,
        sourceUrl: `https://www.youtube.com/watch?v=${video.id}`,
        sentimentScore: profile.sentimentScore,
        impactScore: profile.impactScore,
        confidence: profile.confidence,
        rawPayload: {
          source: "youtube_editorial_event",
          channelId: publisher.channelId,
          publisherAuthority: publisher.authority,
          videoId: video.id,
          publishedAt: video.publishedAt ?? null,
          durationSeconds: video.durationSeconds ?? null,
          viewCount: video.viewCount ?? null,
          likeCount: video.likeCount ?? null,
          commentCount: video.commentCount ?? null,
          thumbnailUrl: video.thumbnailUrl ?? null,
          classificationReason: classification.reason,
          editorialAttentionVerified: true,
          musicDemandConfirmed: false,
          expectedArtistViews: profile.expectedViews,
          reachRatio: profile.reachRatio,
          engagementRate: profile.engagementRate,
          editorialImpactMultiplier: profile.impactMultiplier,
          editorialImpactLabel: profile.label
        }
      });
    }
  }

  return events;
}

function classifyEditorialVideo(video: YoutubeVideo): EditorialClassification | null {
  const title = normalizeText(video.title);
  const context = normalizeText(`${video.title} ${video.description ?? ""}`);

  if (hasAnyTerm(title, LYRICS_INTERVIEW_TERMS)) {
    return { reason: "lyrics_interview", eventType: "news", baseImpact: 19 };
  }

  if (hasAnyTerm(title, DOCUMENTARY_TERMS) && hasAnyTerm(context, MUSIC_CONTEXT_TERMS)) {
    return { reason: "music_documentary", eventType: "news", baseImpact: 18 };
  }

  if (hasAnyTerm(title, PERFORMANCE_TERMS)) {
    return { reason: "editorial_performance", eventType: "viral", baseImpact: 22 };
  }

  if (hasAnyTerm(title, INTERVIEW_TERMS) && hasAnyTerm(context, MUSIC_CONTEXT_TERMS)) {
    return { reason: "music_interview", eventType: "news", baseImpact: 16 };
  }

  return null;
}

function matchEditorialVideoArtists(video: YoutubeVideo, artists: MarketUpdateArtist[]) {
  const title = normalizeText(video.title);

  return artists.filter((artist) => {
    const artistName = normalizeText(artist.name);

    if (!artistName || !hasWholePhrase(title, artistName)) {
      return false;
    }

    // These names are ordinary prose when lowercased; require publisher-style name placement.
    if (AMBIGUOUS_SINGLE_WORD_ARTISTS.has(artistName)) {
      const rawPattern = new RegExp(`(?:^|[-|:,(]\\s*)${escapeRegExp(artist.name)}(?:\\s|$|[-|:,)])`);
      return rawPattern.test(video.title);
    }

    return true;
  });
}

function getEditorialImpactProfile(
  video: YoutubeVideo,
  artist: MarketUpdateArtist,
  publisher: EditorialChannel,
  classification: EditorialClassification,
  runDate: string
) {
  const views = video.viewCount ?? 0;
  const likes = video.likeCount ?? 0;
  const comments = video.commentCount ?? 0;
  const hasEngagementData = typeof video.likeCount === "number" || typeof video.commentCount === "number";
  const expectedViews = getExpectedViews(artist);
  const releaseAgeDays = getReleaseAgeDays(video.publishedAt, runDate);
  const ageAdjustedExpectedViews = expectedViews * clamp(releaseAgeDays / 7, 0.35, 1);
  const reachRatio = ageAdjustedExpectedViews > 0 ? views / ageAdjustedExpectedViews : 0;
  const engagementRate = views > 0 ? (likes + comments * 2) / views : 0;

  if (views < 2_500 || (reachRatio < 0.08 && views < 10_000)) {
    return {
      accepted: false,
      expectedViews,
      reachRatio,
      engagementRate,
      impactMultiplier: 0,
      impactScore: 0,
      sentimentScore: 0,
      confidence: 0,
      label: "below_meaningful_reach"
    };
  }

  const reachMultiplier =
    reachRatio >= 2 ? 1.28 : reachRatio >= 1 ? 1.12 : reachRatio >= 0.5 ? 0.92 : reachRatio >= 0.2 ? 0.72 : 0.55;
  const engagementMultiplier = !hasEngagementData
    ? 1
    : engagementRate >= 0.08
      ? 1.12
      : engagementRate >= 0.04
        ? 1.06
        : engagementRate < 0.01
          ? 0.88
          : 1;
  const authorityMultiplier = publisher.authority === "primary" ? 1 : 0.9;
  const impactMultiplier = reachMultiplier * engagementMultiplier * authorityMultiplier;
  const impactScore = Math.round(clamp(classification.baseImpact * impactMultiplier, 8, 38));
  const sentimentScore = Math.round(clamp(7 + impactScore * 0.34, 8, 20));
  const confidence = Number(clamp(0.66 + Math.min(reachRatio, 2) * 0.08 + Math.min(engagementRate, 0.1), 0.66, 0.9).toFixed(3));
  const label = reachRatio >= 2 ? "breakout" : reachRatio >= 1 ? "strong" : reachRatio >= 0.5 ? "solid" : "modest";

  return {
    accepted: true,
    expectedViews,
    reachRatio: Number(reachRatio.toFixed(4)),
    engagementRate: Number(engagementRate.toFixed(4)),
    impactMultiplier: Number(impactMultiplier.toFixed(3)),
    impactScore,
    sentimentScore,
    confidence,
    label
  };
}

function getExpectedViews(artist: MarketUpdateArtist) {
  const categoryBase: Record<MarketUpdateArtist["category"], number> = {
    underground: 25_000,
    rising: 65_000,
    mainstream: 150_000,
    superstar: 350_000
  };
  const price = Number.isFinite(artist.currentPrice) ? artist.currentPrice : 0;
  const priceBase =
    price >= 100 ? 350_000 : price >= 70 ? 180_000 : price >= 35 ? 85_000 : price >= 15 ? 45_000 : 22_000;

  return Math.max(categoryBase[artist.category] ?? 35_000, priceBase);
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
  const playlistUrl = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
  playlistUrl.searchParams.set("part", "snippet,contentDetails");
  playlistUrl.searchParams.set("playlistId", playlistId);
  playlistUrl.searchParams.set("maxResults", String(clamp(Math.trunc(maxResults), 1, 20)));
  playlistUrl.searchParams.set("key", apiKey);

  const playlistResult = await fetchJson(playlistUrl.toString(), timeoutMs, fetchImpl);

  if (!playlistResult.ok) {
    return playlistResult;
  }

  const playlistItems = toArray(toRecord(playlistResult.value).items);
  const videos = playlistItems
    .map((item) => {
      const row = toRecord(item);
      const snippet = toRecord(row.snippet);
      const contentDetails = toRecord(row.contentDetails);
      const resourceId = toRecord(snippet.resourceId);

      return {
        id: getString(contentDetails.videoId) || getString(resourceId.videoId),
        title: getString(snippet.title),
        description: getString(snippet.description) || null,
        publishedAt: getString(snippet.publishedAt) || undefined,
        thumbnailUrl: getThumbnailUrl(snippet.thumbnails)
      };
    })
    .filter((video) => video.id && video.title);

  if (!videos.length) {
    return { ok: true, videos: [] };
  }

  const videoUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
  videoUrl.searchParams.set("part", "snippet,contentDetails,statistics");
  videoUrl.searchParams.set("id", videos.map((video) => video.id).join(","));
  videoUrl.searchParams.set("key", apiKey);
  const videoResult = await fetchJson(videoUrl.toString(), timeoutMs, fetchImpl);

  if (!videoResult.ok) {
    return videoResult;
  }

  const detailsById = new Map(
    toArray(toRecord(videoResult.value).items).map((item) => {
      const row = toRecord(item);
      const snippet = toRecord(row.snippet);
      const statistics = toRecord(row.statistics);
      const contentDetails = toRecord(row.contentDetails);

      return [getString(row.id), {
        title: getString(snippet.title),
        description: getString(snippet.description) || null,
        publishedAt: getString(snippet.publishedAt) || undefined,
        thumbnailUrl: getThumbnailUrl(snippet.thumbnails),
        durationSeconds: parseIsoDurationSeconds(getString(contentDetails.duration)),
        viewCount: parseOptionalNumber(statistics.viewCount),
        likeCount: parseOptionalNumber(statistics.likeCount),
        commentCount: parseOptionalNumber(statistics.commentCount)
      }]
    })
  );

  return {
    ok: true,
    videos: videos.map((video) => ({ ...video, ...detailsById.get(video.id) }))
  };
}

async function fetchJson(url: string, timeoutMs: number, fetchImpl: typeof fetch) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, { signal: controller.signal });
    const text = await response.text();

    if (!response.ok) {
      const payload = tryParseJson(text);
      const error = toRecord(toRecord(payload).error);
      return { ok: false as const, error: getString(error.message) || `YouTube editorial request failed with ${response.status}.` };
    }

    return { ok: true as const, value: JSON.parse(text) as unknown };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "YouTube editorial request failed." };
  } finally {
    clearTimeout(timeout);
  }
}

function channel(name: string, channelId: string, authority: EditorialChannel["authority"]): EditorialChannel {
  return { name, channelId, uploadsPlaylistId: `UU${channelId.slice(2)}`, authority };
}

function isShortForm(video: YoutubeVideo) {
  const title = normalizeText(video.title);
  return (video.durationSeconds ?? 0) > 0 && (video.durationSeconds ?? 0) <= 75 || hasAnyTerm(title, ["shorts", "youtube shorts"]);
}

function isWithinLookback(publishedAt: string | undefined, runDate: string, lookbackDays: number) {
  const eventDate = parseDate(publishedAt);
  if (!eventDate) return false;
  const age = daysBetween(eventDate, runDate);
  return age >= 0 && age <= lookbackDays;
}

function getReleaseAgeDays(publishedAt: string | undefined, runDate: string) {
  const timestamp = publishedAt ? new Date(publishedAt).getTime() : Number.NaN;
  if (!Number.isFinite(timestamp)) return 7;
  const runTimestamp = new Date(`${runDate}T23:59:59.999Z`).getTime();
  return Math.max(0.08, (runTimestamp - timestamp) / 86_400_000);
}

function parseDate(value: string | undefined) {
  return value && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
}

function daysBetween(start: string, end: string) {
  return Math.round((new Date(`${end}T00:00:00.000Z`).getTime() - new Date(`${start}T00:00:00.000Z`).getTime()) / 86_400_000);
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function hasWholePhrase(value: string, phrase: string) {
  return new RegExp(`(?:^|\\s)${escapeRegExp(phrase).replace(/\\ /g, "\\s+")}(?=$|\\s)`).test(value);
}

function hasAnyTerm(value: string, terms: string[]) {
  return terms.some((term) => hasWholePhrase(value, normalizeText(term)));
}

function parseIsoDurationSeconds(value: string) {
  const match = value.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return null;
  return Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
}

function parseOptionalNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getThumbnailUrl(value: unknown) {
  const thumbnails = toRecord(value);
  for (const key of ["maxres", "standard", "high", "medium", "default"]) {
    const url = getString(toRecord(thumbnails[key]).url);
    if (url) return url;
  }
  return null;
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function toArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function tryParseJson(value: string) {
  try { return JSON.parse(value) as unknown; } catch { return {}; }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const LYRICS_INTERVIEW_TERMS = ["lyrics and meaning", "official lyrics and meaning"];
const INTERVIEW_TERMS = [
  "interview", "talks", "discuss", "discusses", "explains", "breaks down", "behind the song", "conversation"
];
const DOCUMENTARY_TERMS = ["documentary", "mini documentary", "profile", "the story of"];
const PERFORMANCE_TERMS = ["performance", "live session", "freestyle", "on the radar", "a colors show"];
const MUSIC_CONTEXT_TERMS = [
  "album", "beat", "career", "collaboration", "feature", "lyrics", "mixtape", "music", "producer", "rap", "release", "song", "studio", "tour", "track"
];
const AMBIGUOUS_SINGLE_WORD_ARTISTS = new Set(["future"]);
