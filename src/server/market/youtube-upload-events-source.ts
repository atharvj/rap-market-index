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
      description?: string;
      publishedAt?: string;
      thumbnails?: YoutubeThumbnails;
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

type YoutubeVideosListResponse = {
  items?: Array<{
    id?: string;
    snippet?: {
      title?: string;
      description?: string;
      publishedAt?: string;
      thumbnails?: YoutubeThumbnails;
    };
    contentDetails?: {
      duration?: string;
    };
    statistics?: {
      viewCount?: string;
      likeCount?: string;
      commentCount?: string;
    };
  }>;
  error?: {
    message?: string;
  };
};

type YoutubeThumbnails = Record<string, { url?: string; width?: number; height?: number } | undefined>;

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

type YoutubeUploadClassification = {
  eventType: MarketEvent["eventType"];
  sentimentScore: number;
  impactScore: number;
  confidence: number;
  reason: string;
  releaseKind?: "album" | "ep" | "mixtape" | "single";
  qualityLabel?: string;
  qualityMultiplier?: number;
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
const DEFAULT_MAX_VIDEOS_PER_ARTIST = 12;
const OFFICIAL_AUDIO_CLUSTER_MIN_UPLOADS = 3;

export async function collectYoutubeUploadEvents({
  artists,
  runDate,
  apiKey,
  externalIds = {},
  maxVideosPerArtist = DEFAULT_MAX_VIDEOS_PER_ARTIST,
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
    const classification = classifyYoutubeUploadTitle(video.title, video);

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
        durationSeconds: video.durationSeconds ?? null,
        viewCount: video.viewCount ?? null,
        likeCount: video.likeCount ?? null,
        commentCount: video.commentCount ?? null,
        descriptionProjectName: inferProjectTitleFromDescription(video.description, artist.name),
        thumbnailUrl: video.thumbnailUrl ?? null,
        artistCategory: artist.category,
        artistCurrentPrice: artist.currentPrice,
        artistHypeScore: artist.hypeScore,
        uploadQualityLabel: classification.qualityLabel ?? null,
        uploadQualityMultiplier: classification.qualityMultiplier ?? 1,
        classificationReason: classification.reason,
        releaseKind: classification.releaseKind ?? null,
        standaloneTrackAudio: classification.reason === "track_audio_upload_title"
      }
    });
  }

  return addOfficialAudioReleaseClusterEvent({
    artist,
    runDate,
    channelId,
    videos,
    events
  });
}

function addOfficialAudioReleaseClusterEvent({
  artist,
  runDate,
  channelId,
  videos,
  events
}: {
  artist: MarketUpdateArtist;
  runDate: string;
  channelId: string;
  videos: YoutubeVideo[];
  events: MarketEvent[];
}) {
  const cluster = findOfficialAudioReleaseCluster(events);

  if (!cluster) {
    return events;
  }

  const hasProjectRelease = events.some((event) => {
    if (event.eventType !== "release") {
      return false;
    }

    const releaseKind = typeof event.rawPayload.releaseKind === "string" ? event.rawPayload.releaseKind : "";
    const reason =
      typeof event.rawPayload.classificationReason === "string" ? event.rawPayload.classificationReason : "";

    return (
      (["album", "ep", "mixtape"].includes(releaseKind) || reason === "album_announcement_upload_title") &&
      Math.abs(daysBetween(event.eventDate, cluster.eventDate)) <= 1
    );
  });

  if (hasProjectRelease) {
    return suppressClusterTrackEvents(events, cluster);
  }

  const projectName = inferProjectTitleFromCluster(artist, cluster.events);
  const representativeEvent = getRepresentativeClusterEvent(cluster.events);
  const representativeVideoId = getRawString(representativeEvent.rawPayload.videoId);
  const representativeTitle = representativeEvent.title;
  const representativeViewCount = getRawNumber(representativeEvent.rawPayload.viewCount);
  const representativeLikeCount = getRawNumber(representativeEvent.rawPayload.likeCount);
  const representativeCommentCount = getRawNumber(representativeEvent.rawPayload.commentCount);
  const thumbnailUrl = getRawString(representativeEvent.rawPayload.thumbnailUrl) ?? null;
  const clusterProfile = getOfficialAudioClusterProfile({
    artist,
    clusterEvents: cluster.events,
    allVideos: videos,
    eventDate: cluster.eventDate,
    runDate
  });

  if (!projectName && cluster.events.length < 4 && clusterProfile.reachRatio < 0.8) {
    return suppressClusterTrackEvents(events, cluster);
  }

  const confidence = Number((clusterProfile.confidence).toFixed(3));
  const impactScore = Math.round(clusterProfile.impactScore);
  const sentimentScore = Math.round(clusterProfile.sentimentScore);
  const relatedTitles = cluster.events.map((event) => event.title);
  const relatedVideoIds = cluster.events
    .map((event) => getRawString(event.rawPayload.videoId))
    .filter((videoId): videoId is string => Boolean(videoId));
  const title = projectName
    ? `${artist.name} - ${projectName}`.slice(0, 160)
    : `${artist.name} multi-track release`.slice(0, 160);

  const clusterEvent: MarketEvent = {
    artistId: artist.id,
    eventDate: cluster.eventDate,
    eventType: "release",
    title,
    sourceName: "YouTube",
    sourceUrl: representativeVideoId ? `https://www.youtube.com/watch?v=${representativeVideoId}` : undefined,
    sentimentScore,
    impactScore,
    confidence,
    rawPayload: {
      source: "youtube_upload_event",
      channelId,
      videoId: representativeVideoId ?? null,
      publishedAt: cluster.publishedAt,
      classificationReason: "official_audio_release_cluster",
      releaseKind: "project",
      inferredReleaseTitle: projectName,
      representativeVideoId,
      representativeVideoTitle: representativeTitle,
      representativeViewCount,
      representativeLikeCount,
      representativeCommentCount,
      thumbnailUrl,
      clusterTotalViews: clusterProfile.totalViews,
      clusterMaxViews: clusterProfile.maxViews,
      clusterMedianViews: clusterProfile.medianViews,
      clusterBaselineViews: clusterProfile.baselineViews,
      clusterReachRatio: clusterProfile.reachRatio,
      clusterReachLabel: clusterProfile.reachLabel,
      clusterReleaseAgeDays: clusterProfile.releaseAgeDays,
      uploadQualityLabel: clusterProfile.reachLabel,
      uploadQualityMultiplier: clusterProfile.qualityMultiplier,
      relatedUploadCount: cluster.events.length,
      relatedUploadTitles: relatedTitles,
      relatedVideoIds
    }
  };

  return [clusterEvent, ...suppressClusterTrackEvents(events, cluster)];
}

function findOfficialAudioReleaseCluster(events: MarketEvent[]) {
  const trackAudioEvents = events.filter((event) => event.rawPayload.classificationReason === "track_audio_upload_title");

  if (trackAudioEvents.length < OFFICIAL_AUDIO_CLUSTER_MIN_UPLOADS) {
    return null;
  }

  const groupedByDate = new Map<string, MarketEvent[]>();

  for (const event of trackAudioEvents) {
    const group = groupedByDate.get(event.eventDate) ?? [];
    group.push(event);
    groupedByDate.set(event.eventDate, group);
  }

  const sameDateCluster = [...groupedByDate.entries()]
    .filter(([, group]) => group.length >= OFFICIAL_AUDIO_CLUSTER_MIN_UPLOADS)
    .sort((a, b) => {
      if (b[1].length !== a[1].length) {
        return b[1].length - a[1].length;
      }

      return b[0].localeCompare(a[0]);
    })[0];

  if (sameDateCluster) {
    return {
      eventDate: sameDateCluster[0],
      publishedAt: getLatestPublishedAt(sameDateCluster[1]),
      events: sameDateCluster[1]
    };
  }

  const sorted = [...trackAudioEvents].sort((a, b) => a.eventDate.localeCompare(b.eventDate));
  const earliest = sorted[0];
  const latest = sorted[sorted.length - 1];

  if (!earliest || !latest || daysBetween(earliest.eventDate, latest.eventDate) > 1) {
    return null;
  }

  return {
    eventDate: latest.eventDate,
    publishedAt: getLatestPublishedAt(sorted),
    events: sorted
  };
}

function getLatestPublishedAt(events: MarketEvent[]) {
  return (
    events
      .map((event) => event.rawPayload.publishedAt)
      .filter((value): value is string => typeof value === "string" && value.length > 0)
      .sort()
      .at(-1) ?? null
  );
}

function suppressClusterTrackEvents(events: MarketEvent[], cluster: { events: MarketEvent[] }) {
  const clusterVideoIds = new Set(
    cluster.events.map((event) => getRawString(event.rawPayload.videoId)).filter((videoId): videoId is string => Boolean(videoId))
  );

  return events.filter((event) => {
    if (event.rawPayload.classificationReason !== "track_audio_upload_title") {
      return true;
    }

    const videoId = getRawString(event.rawPayload.videoId);

    return !videoId || !clusterVideoIds.has(videoId);
  });
}

function getRepresentativeClusterEvent(events: MarketEvent[]) {
  return [...events].sort((first, second) => getEventReachValue(second) - getEventReachValue(first))[0] ?? events[0];
}

function getEventReachValue(event: MarketEvent) {
  const viewCount = getRawNumber(event.rawPayload.viewCount) ?? 0;
  const likeCount = getRawNumber(event.rawPayload.likeCount) ?? 0;
  const commentCount = getRawNumber(event.rawPayload.commentCount) ?? 0;

  return viewCount + likeCount * 8 + commentCount * 20;
}

function inferProjectTitleFromCluster(artist: MarketUpdateArtist, events: MarketEvent[]) {
  const candidates = events
    .map((event) => getRawString(event.rawPayload.descriptionProjectName))
    .filter((value): value is string => Boolean(value));

  if (!candidates.length) {
    return null;
  }

  const counts = new Map<string, { value: string; count: number }>();

  for (const candidate of candidates) {
    const key = normalizeTitle(candidate);

    if (!key || key === normalizeTitle(artist.name)) {
      continue;
    }

    const existing = counts.get(key);
    counts.set(key, {
      value: existing?.value ?? candidate,
      count: (existing?.count ?? 0) + 1
    });
  }

  return (
    [...counts.values()]
      .sort((first, second) => {
        if (second.count !== first.count) {
          return second.count - first.count;
        }

        return first.value.length - second.value.length;
      })[0]?.value ?? null
  );
}

function inferProjectTitleFromDescription(description: string | null | undefined, artistName: string) {
  const text = description?.replace(/\s+/g, " ").trim();

  if (!text) {
    return null;
  }

  const patterns = [
    /\bstream\s+["“”']?([a-z0-9][a-z0-9 &'’.,!?-]{1,70}?)["“”']?\s*(?:[:\-]\s*)?(?:https?:\/\/|link\b|out now\b)/i,
    /\blisten\s+["“”']?([a-z0-9][a-z0-9 &'’.,!?-]{1,70}?)["“”']?\s*(?:[:\-]\s*)?(?:https?:\/\/|link\b|out now\b)/i,
    /\bstream\s+(?:the\s+)?(?:new\s+)?(?:album|project|mixtape|tape|ep)?\s*["“”']?([a-z0-9][a-z0-9 &'’.,!?-]{1,70}?)["“”']?\s*:/i,
    /\blisten\s+(?:to\s+)?(?:the\s+)?(?:new\s+)?(?:album|project|mixtape|tape|ep)?\s*["“”']?([a-z0-9][a-z0-9 &'’.,!?-]{1,70}?)["“”']?\s*:/i,
    /\b(?:album|project|mixtape|tape|ep)\s*[:\-]\s*["“”']?([a-z0-9][a-z0-9 &'’.,!?-]{1,70}?)(?:["“”']|\s{2,}|$)/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const cleaned = cleanInferredProjectTitle(match?.[1], artistName);

    if (cleaned) {
      return cleaned;
    }
  }

  return null;
}

function cleanInferredProjectTitle(value: string | undefined, artistName: string) {
  const cleaned = value
    ?.replace(/https?:\/\/\S+/gi, "")
    .replace(/\b(?:on|out now|available|everywhere|all platforms|here|below|link in bio)\b.*$/i, "")
    .replace(/^[\s"'“”‘’.,:;-]+|[\s"'“”‘’.,:;-]+$/g, "")
    .trim();

  if (!cleaned) {
    return null;
  }

  const normalized = normalizeTitle(cleaned);
  const blocked = new Set([
    "album",
    "all platforms",
    "everywhere",
    "here",
    "music",
    "new album",
    "new music",
    "new project",
    "now",
    "project",
    normalizeTitle(artistName)
  ]);

  if (blocked.has(normalized) || normalized.length < 2 || normalized.length > 60) {
    return null;
  }

  if (cleaned.split(/\s+/).length > 8) {
    return null;
  }

  return cleaned;
}

function getOfficialAudioClusterProfile({
  artist,
  clusterEvents,
  allVideos,
  eventDate,
  runDate
}: {
  artist: MarketUpdateArtist;
  clusterEvents: MarketEvent[];
  allVideos: YoutubeVideo[];
  eventDate: string;
  runDate: string;
}) {
  const viewCounts = clusterEvents.map((event) => getRawNumber(event.rawPayload.viewCount) ?? 0).filter((value) => value > 0);
  const totalViews = viewCounts.reduce((sum, value) => sum + value, 0);
  const maxViews = Math.max(0, ...viewCounts);
  const medianViews = getMedian(viewCounts) ?? 0;
  const releaseAgeDays = Math.max(0, daysBetween(eventDate, runDate));
  const baselineViews = getRecentUploadBaselineViews(allVideos, clusterEvents);
  const expectedViews = getExpectedProjectViews(artist);
  const ageFactor = clampNumber(releaseAgeDays / 7, 0.35, 1);
  const effectiveBaseline = Math.max(expectedViews * ageFactor, (baselineViews ?? 0) * ageFactor);
  const reachRatio =
    effectiveBaseline > 0 ? Math.max(maxViews / effectiveBaseline, totalViews / (effectiveBaseline * 2.45)) : 1;
  const profile = getClusterReachProfile({ maxViews, totalViews, reachRatio });
  const countLift = clusterEvents.length >= 6 ? 8 : clusterEvents.length >= 3 ? 5 : 0;
  const baseImpact = 40 + countLift;
  const baseSentiment = 22 + Math.min(8, clusterEvents.length * 2);
  const hasProjectName = Boolean(inferProjectTitleFromCluster(artist, clusterEvents));

  return {
    totalViews,
    maxViews,
    medianViews,
    baselineViews: baselineViews ?? null,
    reachRatio: Number(reachRatio.toFixed(3)),
    releaseAgeDays,
    reachLabel: profile.label,
    qualityMultiplier: profile.multiplier,
    impactScore: clampNumber(baseImpact * profile.multiplier, 8, 68),
    sentimentScore: clampNumber(baseSentiment * profile.multiplier, 4, 48),
    confidence: clampNumber((clusterEvents.length >= 3 ? 0.72 : 0.64) * profile.confidenceMultiplier + (hasProjectName ? 0.04 : 0), 0.42, 0.86)
  };
}

function getClusterReachProfile({
  maxViews,
  totalViews,
  reachRatio
}: {
  maxViews: number;
  totalViews: number;
  reachRatio: number;
}) {
  if (maxViews < 15_000 && totalViews < 45_000) {
    return { label: "weak_project_reach", multiplier: 0.42, confidenceMultiplier: 0.68 };
  }

  if (reachRatio < 0.22) {
    return { label: "well_below_artist_baseline", multiplier: 0.54, confidenceMultiplier: 0.76 };
  }

  if (reachRatio < 0.45) {
    return { label: "below_artist_baseline", multiplier: 0.68, confidenceMultiplier: 0.84 };
  }

  if (reachRatio < 0.8) {
    return { label: "near_artist_baseline", multiplier: 0.9, confidenceMultiplier: 0.95 };
  }

  if (reachRatio > 2.1) {
    return { label: "breakout_project_reach", multiplier: 1.18, confidenceMultiplier: 1.08 };
  }

  if (reachRatio > 1.25) {
    return { label: "above_artist_baseline", multiplier: 1.08, confidenceMultiplier: 1.04 };
  }

  return { label: "artist_baseline_project_reach", multiplier: 1, confidenceMultiplier: 1 };
}

function getRecentUploadBaselineViews(videos: YoutubeVideo[], clusterEvents: MarketEvent[]) {
  const clusterVideoIds = new Set(
    clusterEvents.map((event) => getRawString(event.rawPayload.videoId)).filter((videoId): videoId is string => Boolean(videoId))
  );
  const candidates = videos
    .filter((video) => !clusterVideoIds.has(video.id))
    .filter((video) => !isShortFormUpload(video.title, normalizeTitle(video.title), video))
    .map((video) => video.viewCount ?? 0)
    .filter((value) => value >= 5_000);

  return getMedian(candidates);
}

function getExpectedProjectViews(artist: MarketUpdateArtist) {
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

function getMedian(values: number[]) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);

  if (!sorted.length) {
    return null;
  }

  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function getRawString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getRawNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function classifyYoutubeUploadTitle(title: string, video?: YoutubeVideo): YoutubeUploadClassification | null {
  const normalized = normalizeTitle(title);

  if (!normalized) {
    return null;
  }

  const hasAlbumSignal = hasAnyTerm(normalized, ALBUM_ANNOUNCEMENT_TERMS);
  const hasSingleSignal = hasAnyTerm(normalized, SINGLE_RELEASE_TERMS);
  const hasOfficialVideoSignal = hasAnyTerm(normalized, OFFICIAL_VIDEO_TERMS);
  const hasTrackAudioSignal = hasAnyTerm(normalized, TRACK_AUDIO_TERMS);
  const hasVideoReleaseSignal = hasAnyTerm(normalized, VIDEO_RELEASE_TERMS);
  const hasMajorFeatureSignal = hasAnyTerm(normalized, MAJOR_FEATURE_TERMS);
  const hasSnippetSignal = hasAnyTerm(normalized, SNIPPET_TERMS);
  const hasTourSignal = hasAnyTerm(normalized, TOUR_TERMS);
  const hasPerformanceSignal = hasAnyTerm(normalized, PERFORMANCE_TERMS);
  const hasExplicitReleaseSignal =
    hasAlbumSignal || hasSingleSignal || hasOfficialVideoSignal || hasVideoReleaseSignal || hasMajorFeatureSignal;

  if ((hasLowSignalUploadTitle(title, normalized) || isPromoHashtagTitle(title, normalized)) && !hasExplicitReleaseSignal) {
    return null;
  }

  if (hasTourSignal) {
    return applyUploadQuality({
      eventType: "tour",
      sentimentScore: 25,
      impactScore: 32,
      confidence: 0.72,
      reason: "tour_upload_title"
    }, title, normalized, video);
  }

  if (hasAlbumSignal) {
    const releaseKind = getYoutubeProjectReleaseKind(normalized);

    return applyUploadQuality({
      eventType: "release",
      sentimentScore: 32,
      impactScore: 55,
      confidence: 0.78,
      reason: "album_announcement_upload_title",
      releaseKind
    }, title, normalized, video);
  }

  if (hasMajorFeatureSignal && (hasSingleSignal || hasOfficialVideoSignal || hasTrackAudioSignal)) {
    return applyUploadQuality({
      eventType: "viral",
      sentimentScore: 38,
      impactScore: 58,
      confidence: 0.78,
      reason: "major_feature_upload_title"
    }, title, normalized, video);
  }

  if (hasSingleSignal || hasOfficialVideoSignal) {
    if (hasTrackAudioSignal && !hasSingleSignal && !hasVideoReleaseSignal) {
      return applyUploadQuality({
        eventType: "release",
        sentimentScore: 10,
        impactScore: 16,
        confidence: 0.46,
        reason: "track_audio_upload_title"
      }, title, normalized, video);
    }

    return applyUploadQuality({
      eventType: "release",
      sentimentScore: 26,
      impactScore: hasOfficialVideoSignal ? 44 : 38,
      confidence: 0.74,
      reason: hasOfficialVideoSignal ? "official_video_upload_title" : "single_upload_title",
      releaseKind: "single"
    }, title, normalized, video);
  }

  if (hasSnippetSignal) {
    return applyUploadQuality({
      eventType: "viral",
      sentimentScore: 18,
      impactScore: 28,
      confidence: 0.6,
      reason: "snippet_upload_title"
    }, title, normalized, video);
  }

  if (hasPerformanceSignal) {
    return applyUploadQuality({
      eventType: "viral",
      sentimentScore: 16,
      impactScore: 24,
      confidence: 0.58,
      reason: "performance_upload_title"
    }, title, normalized, video);
  }

  return null;
}

function applyUploadQuality(
  classification: YoutubeUploadClassification,
  rawTitle: string,
  normalizedTitle: string,
  video?: YoutubeVideo
): YoutubeUploadClassification | null {
  const quality = getUploadQuality(classification, rawTitle, normalizedTitle, video);

  if (!quality.accepted) {
    return null;
  }

  return {
    ...classification,
    sentimentScore: Math.round(classification.sentimentScore * quality.multiplier),
    impactScore: Math.round(classification.impactScore * quality.multiplier),
    confidence: Number(Math.max(0.25, classification.confidence * quality.multiplier).toFixed(3)),
    qualityLabel: quality.label,
    qualityMultiplier: quality.multiplier
  };
}

function getUploadQuality(
  classification: YoutubeUploadClassification,
  rawTitle: string,
  normalizedTitle: string,
  video?: YoutubeVideo
) {
  const isShortForm = isShortFormUpload(rawTitle, normalizedTitle, video);
  const viewCount = video?.viewCount;
  const lowReach = typeof viewCount === "number" && viewCount < 15_000;
  const modestReach = typeof viewCount === "number" && viewCount < 35_000;
  const weakCatalyst =
    classification.reason === "snippet_upload_title" ||
    classification.reason === "performance_upload_title" ||
    classification.reason === "track_audio_upload_title" ||
    classification.reason === "tour_upload_title";
  const majorReleaseCatalyst =
    classification.reason === "album_announcement_upload_title" ||
    classification.reason === "major_feature_upload_title" ||
    classification.releaseKind === "album" ||
    classification.releaseKind === "ep" ||
    classification.releaseKind === "mixtape";

  if ((isShortForm || lowReach) && weakCatalyst) {
    return {
      accepted: false,
      label: isShortForm ? "short_form_weak_catalyst" : "low_reach_weak_catalyst",
      multiplier: 0
    };
  }

  if (isShortForm && !hasExplicitReleaseLanguage(normalizedTitle)) {
    return {
      accepted: false,
      label: "short_form_without_release_language",
      multiplier: 0
    };
  }

  if (lowReach && !majorReleaseCatalyst) {
    return {
      accepted: false,
      label: "low_reach_minor_upload",
      multiplier: 0
    };
  }

  if (isShortForm && modestReach) {
    return {
      accepted: true,
      label: "short_form_dampened",
      multiplier: 0.58
    };
  }

  if (lowReach) {
    return {
      accepted: true,
      label: "low_reach_dampened",
      multiplier: 0.68
    };
  }

  if (modestReach) {
    return {
      accepted: true,
      label: "modest_reach_dampened",
      multiplier: 0.84
    };
  }

  return {
    accepted: true,
    label: "accepted",
    multiplier: 1
  };
}

function hasLowSignalUploadTitle(rawTitle: string, normalizedTitle: string) {
  return (
    hasAnyTerm(normalizedTitle, LOW_SIGNAL_TERMS) ||
    /#(?:shorts?|ytshorts|fyp|foryou|explore|explorepage)\b/i.test(rawTitle)
  );
}

function isPromoHashtagTitle(rawTitle: string, normalizedTitle: string) {
  const hashtagCount = rawTitle.match(/#[a-z0-9_]+/gi)?.length ?? 0;
  const wordCount = normalizedTitle ? normalizedTitle.split(/\s+/).length : 0;

  return hashtagCount >= 2 && wordCount <= 8;
}

function isShortFormUpload(rawTitle: string, normalizedTitle: string, video?: YoutubeVideo) {
  const durationSeconds = video?.durationSeconds;

  return (
    (typeof durationSeconds === "number" && durationSeconds > 0 && durationSeconds <= 75) ||
    hasLowSignalUploadTitle(rawTitle, normalizedTitle)
  );
}

function hasExplicitReleaseLanguage(normalizedTitle: string) {
  return hasAnyTerm(normalizedTitle, [
    "album",
    "album trailer",
    "deluxe",
    "ep",
    "mixtape",
    "music video",
    "new single",
    "new song",
    "official audio",
    "official video",
    "out now",
    "project",
    "single",
    "tracklist",
    "visualizer"
  ]);
}

function getYoutubeProjectReleaseKind(title: string): "album" | "ep" | "mixtape" {
  if (/\bep\b/.test(title)) {
    return "ep";
  }

  if (hasAnyTerm(title, ["mixtape", "tape"])) {
    return "mixtape";
  }

  return "album";
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
  url.searchParams.set("maxResults", String(clampInteger(maxResults, 1, 12)));
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
      description: item.snippet?.description ?? null,
      thumbnailUrl: getYoutubeThumbnailUrl(item.snippet?.thumbnails),
      publishedAt: item.snippet?.publishedAt
    }))
    .filter((video) => Boolean(video.id && video.title));

  return {
    ok: true,
    videos: await hydrateYoutubeVideoDetails({
      apiKey,
      videos,
      timeoutMs,
      fetchImpl
    })
  };
}

async function hydrateYoutubeVideoDetails({
  apiKey,
  videos,
  timeoutMs,
  fetchImpl
}: {
  apiKey: string;
  videos: YoutubeVideo[];
  timeoutMs: number;
  fetchImpl: typeof fetch;
}) {
  if (!videos.length) {
    return videos;
  }

  const url = new URL("https://www.googleapis.com/youtube/v3/videos");

  url.searchParams.set("part", "snippet,contentDetails,statistics");
  url.searchParams.set("id", videos.map((video) => video.id).join(","));
  url.searchParams.set("key", apiKey);

  const result = await fetchJson({
    url: url.toString(),
    timeoutMs,
    fetchImpl
  });

  if (!result.ok) {
    return videos;
  }

  const parsed = result.value as YoutubeVideosListResponse;
  const detailsById = new Map(
    (parsed.items ?? [])
      .filter((item) => item.id)
      .map((item) => [
        item.id as string,
        {
          title: item.snippet?.title?.trim() || undefined,
          description: item.snippet?.description ?? null,
          thumbnailUrl: getYoutubeThumbnailUrl(item.snippet?.thumbnails),
          publishedAt: item.snippet?.publishedAt,
          durationSeconds: parseIsoDurationSeconds(item.contentDetails?.duration),
          viewCount: parseOptionalInteger(item.statistics?.viewCount),
          likeCount: parseOptionalInteger(item.statistics?.likeCount),
          commentCount: parseOptionalInteger(item.statistics?.commentCount)
        }
      ])
  );

  return videos.map((video) => {
    const details = detailsById.get(video.id);

    if (!details) {
      return video;
    }

    return {
      ...video,
      ...details,
      title: details.title ?? video.title,
      description: details.description ?? video.description,
      thumbnailUrl: details.thumbnailUrl ?? video.thumbnailUrl,
      publishedAt: details.publishedAt ?? video.publishedAt
    };
  });
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

function hasAnyTerm(value: string, terms: string[]) {
  return terms.some((term) => hasTerm(value, term));
}

function hasTerm(value: string, term: string) {
  const normalizedTerm = normalizeTitle(term);

  if (!value || !normalizedTerm) {
    return false;
  }

  const pattern = normalizedTerm.split(/\s+/).map(escapeRegExp).join("\\s+");

  return new RegExp(`(^|\\s)${pattern}(?=$|\\s)`).test(value);
}

function clampInteger(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function parseOptionalInteger(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "", 10);

  return Number.isFinite(parsed) ? parsed : null;
}

function parseIsoDurationSeconds(value: string | undefined) {
  if (!value) {
    return null;
  }

  const match = value.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);

  if (!match) {
    return null;
  }

  const hours = Number.parseInt(match[1] ?? "0", 10);
  const minutes = Number.parseInt(match[2] ?? "0", 10);
  const seconds = Number.parseInt(match[3] ?? "0", 10);

  return hours * 3600 + minutes * 60 + seconds;
}

function getYoutubeThumbnailUrl(thumbnails: YoutubeThumbnails | undefined) {
  return (
    thumbnails?.maxres?.url ??
    thumbnails?.standard?.url ??
    thumbnails?.high?.url ??
    thumbnails?.medium?.url ??
    thumbnails?.default?.url ??
    null
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
  "explore",
  "explorepage",
  "foryou",
  "fyp",
  "full interview",
  "gaming",
  "interview",
  "podcast",
  "reaction",
  "recap",
  "stream highlights",
  "tour vlog",
  "youtube shorts",
  "yt shorts",
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
  "ep",
  "ep out now",
  "full album",
  "full project",
  "mixtape announcement",
  "mixtape out now",
  "mixtape",
  "new album",
  "new ep",
  "new mixtape",
  "new project",
  "new tape",
  "project out now",
  "project trailer",
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
  "premieres",
  "released",
  "single",
  "stream now"
];

const OFFICIAL_VIDEO_TERMS = [
  "lyric video",
  "music video",
  "official audio",
  "official lyric video",
  "official video",
  "visualizer"
];

const TRACK_AUDIO_TERMS = [
  "audio",
  "official audio"
];

const VIDEO_RELEASE_TERMS = [
  "lyric video",
  "music video",
  "official lyric video",
  "official video",
  "visualizer"
];

const MAJOR_FEATURE_TERMS = [
  "carti feature",
  "carti verse",
  "carti cosign",
  "carti co sign",
  "carti co-sign",
  "carti assisted",
  "carti-assisted",
  "drake feature",
  "drake verse",
  "drake cosign",
  "drake co sign",
  "drake co-sign",
  "drake assisted",
  "drake-assisted",
  "feat. carti",
  "feat. drake",
  "feat. future",
  "feat. kendrick",
  "feat. travis",
  "feat carti",
  "feat drake",
  "feat future",
  "feat kendrick",
  "feat travis",
  "featuring carti",
  "featuring drake",
  "featuring future",
  "featuring kendrick",
  "featuring travis",
  "ft. carti",
  "ft. drake",
  "ft. future",
  "ft. kendrick",
  "ft. travis",
  "ft carti",
  "ft drake",
  "ft future",
  "ft kendrick",
  "ft travis",
  "opium co sign",
  "opium cosign",
  "with carti",
  "with drake",
  "with future",
  "with kendrick",
  "with travis"
];

const SNIPPET_TERMS = [
  "coming soon",
  "demo",
  "first listen",
  "grail",
  "ig live",
  "in the studio",
  "leak",
  "leaked",
  "new music",
  "preview",
  "previewed",
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
  "a colors show",
  "colors show",
  "freestyle",
  "from the block",
  "live performance",
  "on the radar",
  "official live",
  "performance",
  "rolling loud",
  "studio session"
];
