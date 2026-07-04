import { clamp } from "@/lib/pricing";
import type { MarketUpdateArtist } from "@/server/market/daily-update";
import type {
  AdapterSignal,
  AdapterSignals,
  ArtistExternalIds,
  MarketObservation,
  ObservationBaselines
} from "@/server/market/market-data";
import type { HypeStats } from "@/lib/types";

type YoutubeCommentsCollectOptions = {
  artists: MarketUpdateArtist[];
  runDate: string;
  apiKey?: string;
  externalIds?: Record<string, ArtistExternalIds>;
  baselines?: ObservationBaselines;
  maxVideosPerArtist?: number;
  maxCommentsPerVideo?: number;
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

type YoutubeCommentThreadsResponse = {
  items?: Array<{
    snippet?: {
      topLevelComment?: {
        snippet?: {
          textDisplay?: string;
          textOriginal?: string;
          likeCount?: number;
          publishedAt?: string;
        };
      };
      totalReplyCount?: number;
    };
  }>;
  error?: {
    message?: string;
  };
};

type YoutubeVideo = {
  id: string;
  title?: string;
  publishedAt?: string;
};

type YoutubeComment = {
  text: string;
  likeCount: number;
  publishedAt?: string;
  replyCount: number;
};

type VideoCommentSample = {
  video: YoutubeVideo;
  comments: YoutubeComment[];
};

export type YoutubeCommentMarketSignals = {
  signals: AdapterSignals;
  observations: MarketObservation[];
  warnings: string[];
};

const SOURCE = "youtube_comments";
const COMMENT_SENTIMENT = "comment_sentiment";
const COMMENT_COUNT = "comment_count";
const COMMENT_LIKE_COUNT = "comment_like_count";
const COMMENT_VIDEO_COUNT = "comment_video_count";
const POSITIVE_COMMENT_SHARE = "positive_comment_share";
const NEGATIVE_COMMENT_SHARE = "negative_comment_share";
const REQUEST_ERROR = "request_error";
const MAX_CHANNELS_PER_REQUEST = 50;
const DEFAULT_VIDEOS_PER_ARTIST = 2;
const DEFAULT_COMMENTS_PER_VIDEO = 50;
const MIN_COMMENTS_FOR_SIGNAL = 12;

export async function collectYoutubeCommentMarketSignals({
  artists,
  runDate,
  apiKey,
  externalIds = {},
  baselines = {},
  maxVideosPerArtist = DEFAULT_VIDEOS_PER_ARTIST,
  maxCommentsPerVideo = DEFAULT_COMMENTS_PER_VIDEO,
  delayMs = 250,
  timeoutMs = 10000,
  fetchImpl = fetch
}: YoutubeCommentsCollectOptions): Promise<YoutubeCommentMarketSignals> {
  const cleanApiKey = apiKey?.trim();

  if (!cleanApiKey) {
    return {
      signals: {},
      observations: [],
      warnings: ["YOUTUBE_API_KEY is not configured; skipped YouTube comment reaction signals."]
    };
  }

  const signals: AdapterSignals = {};
  const observations: MarketObservation[] = [];
  const warnings: string[] = [];
  const channelLookups = artists.flatMap((artist) => {
    const channelId = normalizeYoutubeChannelId(externalIds[artist.id]?.youtubeChannelId);

    if (!channelId) {
      signals[artist.id] = {
        stats: {},
        rawPayload: {
          source: SOURCE,
          status: "missing_external_id",
          note: "No youtube_channel_id is configured for this artist."
        }
      };
      return [];
    }

    return [
      {
        artist,
        channelId
      }
    ];
  });

  const uploads = await fetchYoutubeUploadPlaylists({
    apiKey: cleanApiKey,
    channelIds: channelLookups.map((lookup) => lookup.channelId),
    timeoutMs,
    delayMs,
    fetchImpl
  });

  if (!uploads.ok) {
    for (const lookup of channelLookups) {
      signals[lookup.artist.id] = buildErrorSignal(lookup.channelId, uploads.error);
      observations.push(createErrorObservation(lookup.artist.id, runDate, uploads.error, { channelId: lookup.channelId }));
    }

    return {
      signals,
      observations,
      warnings: [uploads.error]
    };
  }

  for (const [index, lookup] of channelLookups.entries()) {
    if (index > 0 && delayMs > 0) {
      await sleep(delayMs);
    }

    const uploadPlaylistId = uploads.playlists[lookup.channelId];

    if (!uploadPlaylistId) {
      const error = "YouTube uploads playlist was not found for this artist channel.";
      signals[lookup.artist.id] = buildErrorSignal(lookup.channelId, error, "missing_uploads_playlist");
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
      signals[lookup.artist.id] = buildErrorSignal(lookup.channelId, videos.error);
      observations.push(
        createErrorObservation(lookup.artist.id, runDate, videos.error, {
          channelId: lookup.channelId,
          uploadPlaylistId
        })
      );
      continue;
    }

    const samples: VideoCommentSample[] = [];

    for (const [videoIndex, video] of videos.videos.entries()) {
      if (videoIndex > 0 && delayMs > 0) {
        await sleep(Math.max(100, Math.floor(delayMs / 2)));
      }

      const comments = await fetchVideoComments({
        apiKey: cleanApiKey,
        videoId: video.id,
        maxResults: maxCommentsPerVideo,
        timeoutMs,
        fetchImpl
      });

      if (comments.ok) {
        samples.push({
          video,
          comments: comments.comments
        });
      } else {
        warnings.push(`${lookup.artist.ticker}: ${comments.error}`);
      }
    }

    const signal = buildYoutubeCommentSignal({
      artist: lookup.artist,
      runDate,
      channelId: lookup.channelId,
      videos: videos.videos,
      samples,
      baseline: baselines[lookup.artist.id] ?? {}
    });

    signals[lookup.artist.id] = signal.signal;
    observations.push(...signal.observations);
  }

  return {
    signals,
    observations,
    warnings:
      channelLookups.length === artists.length
        ? warnings
        : [
            ...warnings,
            `YouTube comments skipped ${artists.length - channelLookups.length} artist(s) without youtube_channel_id.`
          ]
  };
}

function buildYoutubeCommentSignal({
  artist,
  runDate,
  channelId,
  videos,
  samples,
  baseline
}: {
  artist: MarketUpdateArtist;
  runDate: string;
  channelId: string;
  videos: YoutubeVideo[];
  samples: VideoCommentSample[];
  baseline: Record<string, number>;
}): {
  signal: AdapterSignal;
  observations: MarketObservation[];
} {
  const comments = samples.flatMap((sample) => sample.comments);
  const scored = comments
    .map((comment) => ({
      sentiment: scoreCommentSentiment(comment.text),
      weight: getCommentWeight(comment.likeCount),
      likeCount: comment.likeCount,
      replyCount: comment.replyCount
    }))
    .filter((item) => Number.isFinite(item.sentiment));
  const totalWeight = scored.reduce((total, item) => total + item.weight, 0);
  const weightedSentiment = totalWeight
    ? scored.reduce((total, item) => total + item.sentiment * item.weight, 0) / totalWeight
    : 0;
  const commentCount = comments.length;
  const commentLikeCount = comments.reduce((total, comment) => total + comment.likeCount, 0);
  const replyCount = comments.reduce((total, comment) => total + comment.replyCount, 0);
  const positiveShare = commentCount
    ? scored.filter((item) => item.sentiment >= 18).length / commentCount * 100
    : 0;
  const negativeShare = commentCount
    ? scored.filter((item) => item.sentiment <= -18).length / commentCount * 100
    : 0;
  const hasBaseline =
    typeof baseline[COMMENT_SENTIMENT] === "number" &&
    typeof baseline[COMMENT_LIKE_COUNT] === "number" &&
    typeof baseline[COMMENT_COUNT] === "number";
  const hasEnoughComments = commentCount >= MIN_COMMENTS_FOR_SIGNAL;
  const sentimentChange = hasBaseline ? weightedSentiment - baseline[COMMENT_SENTIMENT] : 0;
  const netShare = positiveShare - negativeShare;
  const baselineNetShare =
    typeof baseline[POSITIVE_COMMENT_SHARE] === "number" && typeof baseline[NEGATIVE_COMMENT_SHARE] === "number"
      ? baseline[POSITIVE_COMMENT_SHARE] - baseline[NEGATIVE_COMMENT_SHARE]
      : 0;
  const netShareChange = hasBaseline ? netShare - baselineNetShare : 0;
  const likeMomentum = hasBaseline
    ? calculateRelativeMomentum(commentLikeCount, baseline[COMMENT_LIKE_COUNT], 4.2, -25, 70)
    : 0;
  const countMomentum = hasBaseline
    ? calculateRelativeMomentum(commentCount, baseline[COMMENT_COUNT], 2.8, -18, 42)
    : 0;
  const stats: Partial<HypeStats> = {};

  if (hasBaseline && hasEnoughComments) {
    const reactionScore =
      sentimentChange * 0.92 +
      likeMomentum * 0.38 +
      countMomentum * 0.18 +
      netShareChange * 0.24;

    stats.socialGrowth = clamp(reactionScore, -35, 90);
    stats.newsScore = clamp(50 + sentimentChange * 0.34 + netShareChange * 0.18 + countMomentum * 0.15, 0, 100);
    stats.searchGrowth = clamp(countMomentum * 0.35 + likeMomentum * 0.18 + sentimentChange * 0.16, -20, 50);
    stats.youtubeGrowth = clamp(likeMomentum * 0.22 + countMomentum * 0.16 + sentimentChange * 0.08, -20, 45);
  }

  const rawPayload = {
    source: SOURCE,
    runDate,
    channelId,
    sampledVideoCount: samples.length,
    recentVideoCount: videos.length,
    sampledCommentCount: commentCount,
    commentLikeCount,
    replyCount,
    sentimentAverage: round(weightedSentiment),
    sentimentChange: round(sentimentChange),
    positiveShare: round(positiveShare),
    negativeShare: round(negativeShare),
    netShare: round(netShare),
    netShareChange: round(netShareChange),
    baselineSentiment: baseline[COMMENT_SENTIMENT] ?? null,
    baselineCommentCount: baseline[COMMENT_COUNT] ?? null,
    baselineLikeCount: baseline[COMMENT_LIKE_COUNT] ?? null,
    baselinePositiveShare: baseline[POSITIVE_COMMENT_SHARE] ?? null,
    baselineNegativeShare: baseline[NEGATIVE_COMMENT_SHARE] ?? null,
    videoIds: videos.map((video) => video.id),
    status: hasBaseline ? (hasEnoughComments ? "momentum" : "insufficient_comments") : "baseline_only"
  };
  const observations = [
    createObservation(artist.id, runDate, COMMENT_SENTIMENT, weightedSentiment, "score", rawPayload),
    createObservation(artist.id, runDate, COMMENT_COUNT, commentCount, "comments", rawPayload),
    createObservation(artist.id, runDate, COMMENT_LIKE_COUNT, commentLikeCount, "likes", rawPayload),
    createObservation(artist.id, runDate, COMMENT_VIDEO_COUNT, videos.length, "videos", rawPayload),
    createObservation(artist.id, runDate, POSITIVE_COMMENT_SHARE, positiveShare, "percent", rawPayload),
    createObservation(artist.id, runDate, NEGATIVE_COMMENT_SHARE, negativeShare, "percent", rawPayload)
  ];

  return {
    signal: {
      stats,
      rawPayload,
      confidence: getSignalConfidence(commentCount, commentLikeCount)
    },
    observations
  };
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
      title: item.snippet?.title,
      publishedAt: item.snippet?.publishedAt
    }))
    .filter((video) => Boolean(video.id));

  return {
    ok: true,
    videos
  };
}

async function fetchVideoComments({
  apiKey,
  videoId,
  maxResults,
  timeoutMs,
  fetchImpl
}: {
  apiKey: string;
  videoId: string;
  maxResults: number;
  timeoutMs: number;
  fetchImpl: typeof fetch;
}): Promise<{ ok: true; comments: YoutubeComment[] } | { ok: false; error: string }> {
  const url = new URL("https://www.googleapis.com/youtube/v3/commentThreads");

  url.searchParams.set("part", "snippet");
  url.searchParams.set("videoId", videoId);
  url.searchParams.set("maxResults", String(clampInteger(maxResults, 1, 100)));
  url.searchParams.set("order", "relevance");
  url.searchParams.set("textFormat", "plainText");
  url.searchParams.set("key", apiKey);

  const result = await fetchJson({
    url: url.toString(),
    timeoutMs,
    fetchImpl
  });

  if (!result.ok) {
    return result;
  }

  const parsed = result.value as YoutubeCommentThreadsResponse;
  const comments = (parsed.items ?? [])
    .map((item): YoutubeComment | null => {
      const snippet = item.snippet?.topLevelComment?.snippet;
      const text = snippet?.textOriginal ?? snippet?.textDisplay ?? "";

      if (!text.trim()) {
        return null;
      }

      return {
        text,
        likeCount: Math.max(0, snippet?.likeCount ?? 0),
        publishedAt: snippet?.publishedAt,
        replyCount: Math.max(0, item.snippet?.totalReplyCount ?? 0)
      };
    })
    .filter((comment): comment is YoutubeComment => Boolean(comment));

  return {
    ok: true,
    comments
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
        error: parsed?.error?.message ?? `YouTube comment request failed with ${response.status}.`
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
        error: text.slice(0, 220) || "YouTube comments returned a non-JSON response."
      };
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "YouTube comment request failed."
    };
  } finally {
    clearTimeout(timeout);
  }
}

function scoreCommentSentiment(text: string) {
  const normalized = normalizeCommentText(text);
  let score = 0;

  score += countMatches(normalized, /\b(no skips?|10\/10|aoty|album of the year|instant classic)\b/g) * 1.45;
  score += countMatches(normalized, /\b(fire|heat|banger|classic|masterpiece|goat|legendary|slaps|elite)\b/g) * 1.15;
  score += countMatches(normalized, /\b(love|amazing|great|good|hard|beautiful|crazy|insane|underrated|perfect|repeat|tough|cold|gas)\b/g) * 0.7;
  score += countMatches(normalized, /\b(not bad|not trash|not mid|better than expected)\b/g) * 0.55;
  score -= countMatches(normalized, /\b(not good|not fire|not hard|not it|fell off)\b/g) * 1.05;
  score -= countMatches(normalized, /\b(trash|garbage|mid|flop|boring|washed|terrible|worst|overrated|disappointing|disappointed|skip|weak|cringe|corny)\b/g) * 1.1;
  score -= countMatches(normalized, /\b(ass|bad)\b/g) * 0.7;

  return clamp(score / 4 * 100, -100, 100);
}

function normalizeCommentText(text: string) {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/([a-z])\1{2,}/g, "$1$1")
    .replace(/[^\w\s/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countMatches(text: string, pattern: RegExp) {
  return Array.from(text.matchAll(pattern)).length;
}

function calculateRelativeMomentum(
  current: number,
  previous: number | undefined,
  multiplier: number,
  min: number,
  max: number
) {
  if (typeof previous !== "number" || previous <= 0) {
    return 0;
  }

  return clamp((current - previous) / previous * 100 * multiplier, min, max);
}

function getCommentWeight(likeCount: number) {
  return clamp(1 + Math.log10(likeCount + 1) * 0.24, 1, 2.4);
}

function getSignalConfidence(commentCount: number, commentLikeCount: number) {
  return clamp(0.42 + Math.min(commentCount, 100) / 100 * 0.25 + Math.log10(commentLikeCount + 1) * 0.035, 0.42, 0.82);
}

function buildErrorSignal(channelId: string, error: string, status = "error"): AdapterSignal {
  return {
    stats: {},
    rawPayload: {
      source: SOURCE,
      channelId,
      status,
      error
    }
  };
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
    value: round(value),
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

function chunkItems<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function clampInteger(value: number, min: number, max: number) {
  if (!Number.isInteger(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function tryParseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
