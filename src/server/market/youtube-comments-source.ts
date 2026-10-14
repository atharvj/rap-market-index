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
import type { MarketEvent } from "@/server/market/market-data";
import { expandRecordingEvents, isOfficialRecordingSource } from "@/server/market/recording-credits";
import { getYoutubeVideoId } from "@/server/market/watch-now-videos";
import { TRUSTED_YOUTUBE_EDITORIAL_CHANNELS } from "@/server/market/youtube-editorial-events-source";

type YoutubeCommentsCollectOptions = {
  artists: MarketUpdateArtist[];
  runDate: string;
  apiKey?: string;
  externalIds?: Record<string, ArtistExternalIds>;
  baselines?: ObservationBaselines;
  events?: Record<string, MarketEvent[]>;
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
        id?: string;
        snippet?: {
          authorChannelId?: { value?: string };
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
  channelId?: string;
  audience?: "official" | "editorial";
};

type YoutubeComment = {
  id?: string;
  authorId?: string;
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
const CLASSIFICATION_THRESHOLD = 12;
const SAMPLING_VERSION = 2;

export async function collectYoutubeCommentMarketSignals({
  artists,
  runDate,
  apiKey,
  externalIds = {},
  baselines = {},
  events,
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
  if (events) {
    // Candidate identity and performing credits come from verified discovery;
    // recheck the actual uploader before reading any audience reactions.
    const expanded = expandRecordingEvents(events, artists);
    const commentCache = new Map<string, Promise<Awaited<ReturnType<typeof fetchBalancedVideoComments>>>>();
    let artistIndex = 0;
    const worker = async () => {
      while (artistIndex < artists.length) {
        const artist = artists[artistIndex++];
        const candidates = selectCommentVideos(expanded[artist.id] ?? [], runDate, maxVideosPerArtist);
        const samples: VideoCommentSample[] = [];
        let failures = 0;
        for (const video of candidates) {
          const cacheKey = `${video.id}:${video.channelId}`;
          let pending = commentCache.get(cacheKey);
          if (!pending) {
            pending = (async () => {
              const identity = await verifyVideoUploader(video, cleanApiKey, timeoutMs, fetchImpl);
              const result = identity ? await fetchBalancedVideoComments({ apiKey: cleanApiKey, videoId: video.id, maxResults: maxCommentsPerVideo, timeoutMs, fetchImpl }) : { ok: false as const, error: "Comment video uploader could not be verified." };
              if (delayMs > 0) await sleep(delayMs);
              return result;
            })();
            commentCache.set(cacheKey, pending);
          }
          const comments = await pending;
          if (comments.ok) samples.push({ video, comments: comments.comments });
          else { failures++; warnings.push(`${artist.ticker}: ${comments.error}`); }
        }
        if (candidates.length && failures === candidates.length) {
          signals[artist.id] = buildErrorSignal("", "All verified comment samples were unavailable.");
          observations.push(createErrorObservation(artist.id, runDate, "All verified comment samples were unavailable.", {}));
          continue;
        }
        const result = buildYoutubeCommentSignal({ artist, runDate, channelId: "", videos: candidates, samples, baseline: baselines[artist.id] ?? {} });
        signals[artist.id] = result.signal;
        observations.push(...result.observations);
      }
    };
    // Bound request concurrency and share collaboration samples across workers.
    await Promise.all(Array.from({ length: Math.min(4, artists.length) }, worker));
    return { signals, observations, warnings };
  }
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

      const comments = await fetchBalancedVideoComments({
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
            `YouTube comments skipped missing channel IDs for: ${formatMissingArtistNames({ artists, channelLookups })}.`
          ]
  };
}

function formatMissingArtistNames({
  artists,
  channelLookups
}: {
  artists: MarketUpdateArtist[];
  channelLookups: Array<{ artist: MarketUpdateArtist }>;
}) {
  const mappedIds = new Set(channelLookups.map((lookup) => lookup.artist.id));
  return artists
    .filter((artist) => !mappedIds.has(artist.id))
    .map((artist) => `${artist.name} (${artist.ticker})`)
    .join(", ");
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
  const seenComments = new Set<string>(), seenAuthors = new Set<string>();
  const comments = samples.flatMap((sample) => sample.comments)
    .filter(comment => isRecentDate(comment.publishedAt, runDate, 7))
    .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
    .filter(comment => {
      const id = comment.id ?? `${comment.authorId ?? ""}:${comment.publishedAt}:${comment.text}`;
      if (seenComments.has(id) || (comment.authorId && seenAuthors.has(comment.authorId))) return false;
      seenComments.add(id);
      if (comment.authorId) seenAuthors.add(comment.authorId);
      return true;
    });
  const scored = comments
    .map((comment) => ({
      sentiment: scoreCommentSentiment(comment.text),
      weight: getCommentWeight(comment.likeCount),
      likeCount: comment.likeCount,
      replyCount: comment.replyCount
    }))
    .filter((item) => Number.isFinite(item.sentiment));
  const classified = scored.filter(item => Math.abs(item.sentiment) >= CLASSIFICATION_THRESHOLD);
  const totalWeight = classified.reduce((total, item) => total + item.weight, 0);
  const weightedSentiment = totalWeight
    ? classified.reduce((total, item) => total + item.sentiment * item.weight, 0) / totalWeight
    : 0;
  const commentCount = comments.length;
  const commentLikeCount = comments.reduce((total, comment) => total + comment.likeCount, 0);
  const replyCount = comments.reduce((total, comment) => total + comment.replyCount, 0);
  const positiveShare = commentCount
    ? scored.filter((item) => item.sentiment >= CLASSIFICATION_THRESHOLD).length / commentCount * 100
    : 0;
  const negativeShare = commentCount
    ? scored.filter((item) => item.sentiment <= -CLASSIFICATION_THRESHOLD).length / commentCount * 100
    : 0;
  const sampleScope = getSampleScope(samples.map(sample => sample.video.id));
  const hasBaseline = baseline.sampling_version === SAMPLING_VERSION && baseline.sample_scope === sampleScope &&
    typeof baseline[COMMENT_SENTIMENT] === "number" &&
    typeof baseline[COMMENT_LIKE_COUNT] === "number" &&
    typeof baseline[COMMENT_COUNT] === "number";
  const classifiedCommentCount = classified.length;
  const hasEnoughComments = commentCount >= MIN_COMMENTS_FOR_SIGNAL && classifiedCommentCount >= 6;
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

  if (hasEnoughComments) {
    // Reception has an absolute level as well as momentum. Previously the
    // first sample was forced flat, so an overwhelmingly disliked new song
    // established a negative baseline without displaying that reaction.
    const absoluteReaction = weightedSentiment * 0.34 + netShare * 0.2;
    const momentumReaction = hasBaseline
      ? sentimentChange * 0.35 + netShareChange * 0.12
      : 0;
    let reactionScore = absoluteReaction + momentumReaction;
    // More likes/replies on criticism are not approval, searches or video views.
    // Improving but still strongly negative reception remains a negative input.
    if (weightedSentiment <= -18) reactionScore = Math.min(reactionScore, absoluteReaction * 0.5);
    if (weightedSentiment >= 18) reactionScore = Math.max(reactionScore, absoluteReaction * 0.5);
    stats.socialGrowth = clamp(reactionScore, -45, 45);
  }

  const rawPayload = {
    source: SOURCE,
    runDate,
    channelId,
    sampledVideoCount: samples.length,
    recentVideoCount: videos.length,
    sampledCommentCount: commentCount,
    classifiedCommentCount,
    unclassifiedCommentCount: commentCount - classifiedCommentCount,
    uniqueAuthorCount: seenAuthors.size,
    samplingVersion: SAMPLING_VERSION,
    sampleScope,
    commentLookbackDays: 7,
    sampleOrders: ["time", "relevance"],
    countMomentum: round(countMomentum),
    likeMomentum: round(likeMomentum),
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
    videoIds: samples.map((sample) => sample.video.id),
    requestedVideoIds: videos.map((video) => video.id),
    selectionBias: samples.some(sample => sample.video.audience === "editorial") ? "official_and_trusted_editorial_channels" : "artist_owned_channel_core_fans",
    interpretation: "confirmation_only_not_broad_fan_consensus",
    status: hasEnoughComments ? (hasBaseline ? "momentum_and_reception" : "reception_baseline") : "insufficient_comments"
  };
  const observations = [
    createObservation(artist.id, runDate, COMMENT_SENTIMENT, weightedSentiment, "score", rawPayload),
    createObservation(artist.id, runDate, COMMENT_COUNT, commentCount, "comments", rawPayload),
    createObservation(artist.id, runDate, COMMENT_LIKE_COUNT, commentLikeCount, "likes", rawPayload),
    createObservation(artist.id, runDate, COMMENT_VIDEO_COUNT, videos.length, "videos", rawPayload),
    createObservation(artist.id, runDate, POSITIVE_COMMENT_SHARE, positiveShare, "percent", rawPayload),
    createObservation(artist.id, runDate, NEGATIVE_COMMENT_SHARE, negativeShare, "percent", rawPayload),
    createObservation(artist.id, runDate, "sampling_version", SAMPLING_VERSION, "version", rawPayload),
    createObservation(artist.id, runDate, "sample_scope", sampleScope, "cohort", rawPayload)
  ];

  return {
    signal: {
      stats,
      rawPayload,
      confidence: hasEnoughComments ? getSignalConfidence(classifiedCommentCount, commentLikeCount) : 0
    },
    observations: hasEnoughComments ? observations : observations.filter(observation => observation.metric === COMMENT_COUNT)
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

export function selectCommentVideos(events: MarketEvent[], runDate: string, limit: number): YoutubeVideo[] {
  const publishers = new Set(TRUSTED_YOUTUBE_EDITORIAL_CHANNELS.map(publisher => publisher.channelId));
  const seen = new Set<string>();
  const candidates = events.flatMap(event => {
    const id = getYoutubeVideoId(event.rawPayload, event.sourceUrl ?? null);
    const channelId = String(event.rawPayload.videoChannelId || event.rawPayload.channelId || "");
    const editorial = event.rawPayload.source === "youtube_editorial_event" && event.rawPayload.editorialAttentionVerified === true &&
      publishers.has(channelId) && ["editorial_performance", "lyrics_interview"].includes(String(event.rawPayload.classificationReason));
    if (!id || !channelId || seen.has(id) || !isRecentDate(event.eventDate, runDate, 90) ||
      !(Number(event.rawPayload.durationSeconds) > 75) || (!isOfficialRecordingSource(event.rawPayload) && !editorial)) return [];
    seen.add(id);
    return [{ id, title: event.title, publishedAt: event.eventDate, channelId, audience: editorial ? "editorial" as const : "official" as const }];
  }).sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
  // Reserve one available slot for an independent publisher's audience.
  const independent = candidates.find(video => video.audience === "editorial");
  return [ ...(independent ? [independent] : []), ...candidates.filter(video => video !== independent) ].slice(0, Math.max(0, limit));
}

async function verifyVideoUploader(video: YoutubeVideo, apiKey: string, timeoutMs: number, fetchImpl: typeof fetch) {
  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.search = new URLSearchParams({ part: "snippet", id: video.id, key: apiKey }).toString();
  const result = await fetchJson({ url: url.toString(), timeoutMs, fetchImpl });
  if (!result.ok) return false;
  const payload = result.value as { items?: Array<{ id?: string; snippet?: { channelId?: string } }> } | null;
  return Array.isArray(payload?.items) && payload.items.some(item => item.id === video.id && item.snippet?.channelId === video.channelId);
}

async function fetchBalancedVideoComments(options: Parameters<typeof fetchVideoComments>[0]) {
  const limit = clampInteger(options.maxResults, 1, 100);
  const results = await Promise.all(["time", "relevance"].map(order => fetchVideoComments({ ...options, maxResults: Math.max(1, Math.ceil(limit / 2)), order: order as "time" | "relevance" })));
  const successful = results.filter((result): result is { ok: true; comments: YoutubeComment[] } => result.ok);
  if (!successful.length) return { ok: false as const, error: results.find(result => !result.ok)?.error ?? "Comments unavailable." };
  return { ok: true as const, comments: successful.flatMap(result => result.comments) };
}

function isRecentDate(value: string | undefined, runDate: string, days: number) {
  const observed = Date.parse(value ?? ""), end = Date.parse(`${runDate}T23:59:59.999Z`);
  return Number.isFinite(observed) && Number.isFinite(end) && observed <= end && observed >= end - (days + 1) * 86400000;
}

function getSampleScope(ids: string[]) {
  // A deterministic safe integer identifies the video cohort without storing people.
  let hash = 2166136261;
  for (const char of [...new Set(ids)].sort().join(",")) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return hash;
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
  fetchImpl,
  order = "relevance"
}: {
  apiKey: string;
  videoId: string;
  maxResults: number;
  timeoutMs: number;
  fetchImpl: typeof fetch;
  order?: "time" | "relevance";
}): Promise<{ ok: true; comments: YoutubeComment[] } | { ok: false; error: string }> {
  const url = new URL("https://www.googleapis.com/youtube/v3/commentThreads");

  url.searchParams.set("part", "snippet");
  url.searchParams.set("videoId", videoId);
  url.searchParams.set("maxResults", String(clampInteger(maxResults, 1, 100)));
  url.searchParams.set("order", order);
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
  if (!parsed || !Array.isArray(parsed.items)) return { ok: false, error: "YouTube returned malformed comment results." };
  const comments = (parsed.items ?? [])
    .map((item): YoutubeComment | null => {
      const snippet = item.snippet?.topLevelComment?.snippet;
      const text = snippet?.textOriginal ?? snippet?.textDisplay ?? "";

      if (!text.trim()) {
        return null;
      }

      return {
        id: item.snippet?.topLevelComment?.id,
        authorId: snippet?.authorChannelId?.value,
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

export function scoreCommentSentiment(text: string) {
  let normalized = normalizeCommentText(text);
  let score = 0;
  // Consume negated phrases first so their constituent praise/criticism is not
  // counted again with the opposite sign. Unrecognized text stays unknown.
  normalized = normalized.replace(/\b(?:not|isnt|isn t|aint|ain t)\s+(?:bad|trash|mid|boring|terrible|ass)\b/g, () => { score += 1.1; return " "; });
  normalized = normalized.replace(/\b(?:not|isnt|isn t|aint|ain t)\s+(?:good|fire|hard|great|it)\b|\b(?:don t|dont|do not|didn t|didnt)\s+(?:like|love|enjoy)\b/g, () => { score -= 1.2; return " "; });
  normalized = normalized.replace(/\bno skips?\b/g, () => { score += 1.45; return " "; });
  normalized = normalized.replace(/\b(?:hard to listen(?: to)?|not feeling (?:it|this)|cant listen|couldnt get into (?:it|this))\b/g, () => { score -= 1.2; return " "; });
  score += countMatches(normalized, /\b(no skips?|10\/10|aoty|album of the year|instant classic)\b/g) * 1.45;
  score += countMatches(normalized, /\b(fire|heat|banger|classic|masterpiece|goat|legendary|slaps|elite)\b/g) * 1.15;
  score += countMatches(normalized, /\b(love|amazing|great|good|hard|beautiful|underrated|perfect|tough|cold|gas)\b/g) * 0.7;
  score += countMatches(normalized, /\b(better than expected)\b/g) * 0.8;
  score -= countMatches(normalized, /\b(fell off|trash|garbage|mid|flop|boring|washed|terrible|worst|overrated|disappointing|disappointed|skip|weak|cringe|corny|hate|hated|awful|unlistenable)\b/g) * 1.1;
  score -= countMatches(normalized, /\b(ass|bad)\b/g) * 0.7;
  score -= Math.min(2, Array.from(text.matchAll(/👎|🤮|💩/gu)).length) * 0.8;
  if (score >= 0) score += Math.min(2, Array.from(text.matchAll(/🔥|💯/gu)).length) * 0.8;

  return clamp(score / 4 * 100, -100, 100);
}

function normalizeCommentText(text: string) {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[’']/g, "")
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
  return clamp(0.2 + Math.min(commentCount, 100) / 100 * 0.2 + Math.log10(commentLikeCount + 1) * 0.015, 0.2, 0.5);
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
