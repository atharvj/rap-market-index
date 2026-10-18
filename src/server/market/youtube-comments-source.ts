import { clamp } from "@/lib/pricing";
import { scoreMusicReception as scoreCommentSentiment } from "@/server/market/music-reception";
export { scoreMusicReception as scoreCommentSentiment } from "@/server/market/music-reception";
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
import { expandRecordingEvents, isOfficialRecordingSource, resolveRecordingArtists } from "@/server/market/recording-credits";
import { getYoutubeVideoId } from "@/server/market/watch-now-videos";
import { TRUSTED_YOUTUBE_EDITORIAL_CHANNELS, parseIsoDurationSeconds } from "@/server/market/youtube-editorial-events-source";
import { createArtistReceptionSelector, getLongReactionCopyKey } from "@/server/market/artist-reception";
import { unavailableReception } from "@/server/market/reception-availability";
import { getVerifiedRecordingChannelIds } from "@/server/market/artist-tracking";

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
  catalogueFallback?: boolean;
  catalogueCommentCount?: number;
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
  duplicateCopyCount?: number;
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
const SAMPLING_VERSION = 6;

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
      observations: artists.map(artist => unavailableReception(artist.id, SOURCE, runDate)),
      warnings: ["YOUTUBE_API_KEY is not configured; skipped YouTube comment reaction signals."]
    };
  }

  const signals: AdapterSignals = {};
  const observations: MarketObservation[] = [];
  const warnings: string[] = [];
  const selectReception = createArtistReceptionSelector(artists, externalIds, runDate);
  if (events) {
    // Candidate identity and performing credits come from verified discovery;
    // recheck the actual uploader before reading any audience reactions.
    const expanded = expandRecordingEvents(events, artists);
    // A stale saved candidate must not block discovery from the artist's real
    // channel. Resolve playlists once, including artists with saved candidates.
    const fallbackChannels = maxVideosPerArtist > 0 ? artists.flatMap(artist => getVerifiedRecordingChannelIds(artist, externalIds[artist.id]).map(normalizeYoutubeChannelId))
      .filter((id): id is string => Boolean(id)) : [];
    const fallbackPlaylists = fallbackChannels.length ? await fetchYoutubeUploadPlaylists({ apiKey: cleanApiKey,
      channelIds: [...new Set(fallbackChannels)], timeoutMs, delayMs: 0, fetchImpl }) : null;
    if (fallbackPlaylists && !fallbackPlaylists.ok) warnings.push(`Catalogue comment discovery unavailable: ${fallbackPlaylists.error}`);
    const commentCache = new Map<string, Promise<Awaited<ReturnType<typeof fetchBalancedVideoComments>>>>();
    let artistIndex = 0;
    const worker = async () => {
      while (artistIndex < artists.length) {
        const artist = artists[artistIndex++];
        const primaryLimit = Math.min(3, Math.max(0, Math.floor(maxVideosPerArtist)));
        const attemptLimit = primaryLimit * 4;
        const candidates = selectCommentVideos(expanded[artist.id] ?? [], runDate, primaryLimit * 2);
        const officialChannels = getVerifiedRecordingChannelIds(artist, externalIds[artist.id]).map(normalizeYoutubeChannelId).filter((id): id is string => Boolean(id));
        const samples: VideoCommentSample[] = [], attempted: YoutubeVideo[] = [];
        const attemptedIds = new Set<string>();
        let failures = 0;
        const readVideo = async (video: YoutubeVideo) => {
          if (attemptedIds.has(video.id) || attempted.length >= attemptLimit) return;
          attemptedIds.add(video.id);
          attempted.push(video);
          const cacheKey = `${video.id}:${video.channelId}`;
          let pending = commentCache.get(cacheKey);
          if (!pending) {
            pending = (async () => {
              const identity = await verifyVideoUploader(video, cleanApiKey, timeoutMs, fetchImpl);
              const result = identity ? await fetchBalancedVideoComments({ apiKey: cleanApiKey, videoId: video.id, maxResults: maxCommentsPerVideo, runDate, timeoutMs, fetchImpl }) : { ok: false as const, error: "Comment video uploader could not be verified." };
              if (delayMs > 0) await sleep(delayMs);
              return result;
            })();
            commentCache.set(cacheKey, pending);
          }
          const comments = await pending;
          // A successful empty response is not an outage, but cannot occupy a
          // scarce recording slot and prevent trying another verified song.
          if (comments.ok && comments.comments.length) samples.push({ video, comments: comments.comments, duplicateCopyCount: comments.duplicateCopyCount });
          else if (!comments.ok) { failures++; warnings.push(`${artist.ticker}: ${comments.error}`); }
        };
        for (const video of candidates) {
          if (samples.length >= primaryLimit) break;
          await readVideo(video);
        }
        // Expand thin samples by quantity, never by polarity or whether the
        // classifier likes the result. This avoids hunting for a preferred view.
        const targetCount = Math.min(50, Math.max(1, maxCommentsPerVideo));
        if (primaryLimit && countIndependentComments(samples, runDate).comments.length < targetCount &&
          fallbackPlaylists?.ok && attempted.length < attemptLimit) {
          const channels = officialChannels.filter(channel => fallbackPlaylists.playlists[channel]);
          const catalogues: YoutubeVideo[][] = [];
          for (const channelId of channels) catalogues.push(await fetchCatalogueRecordings({ artist, channelId, playlistId: fallbackPlaylists.playlists[channelId], runDate,
            apiKey: cleanApiKey, limit: attemptLimit, timeoutMs, fetchImpl }));
          // Alternate verified channels so a dormant primary channel cannot
          // exhaust the attempt budget before its official Vevo recordings.
          const catalogue = Array.from({ length: attemptLimit }, (_, index) => catalogues.flatMap(videos => videos[index] ? [videos[index]] : [])).flat();
          for (const video of catalogue) {
            if (samples.length >= primaryLimit * 2 || attempted.length >= attemptLimit || (samples.length >= primaryLimit && countIndependentComments(samples, runDate).comments.length >= targetCount)) break;
            await readVideo(video);
          }
        }
        if (attempted.length && failures === attempted.length) {
          signals[artist.id] = buildErrorSignal("", "All verified comment samples were unavailable.");
          observations.push(createErrorObservation(artist.id, runDate, "All verified comment samples were unavailable.", {}));
          observations.push(unavailableReception(artist.id, SOURCE, runDate));
          continue;
        }
        const result = buildYoutubeCommentSignal({ artist, runDate, channelId: "", videos: attempted, samples, baseline: baselines[artist.id] ?? {}, selectReception, maxCommentsPerVideo });
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
      observations.push(unavailableReception(artist.id, SOURCE, runDate));
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
      observations.push(unavailableReception(lookup.artist.id, SOURCE, runDate));
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
      observations.push(unavailableReception(lookup.artist.id, SOURCE, runDate));
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
      observations.push(unavailableReception(lookup.artist.id, SOURCE, runDate));
      continue;
    }

    const samples: VideoCommentSample[] = [];

    for (const [videoIndex, video] of videos.videos.entries()) {
      video.channelId = lookup.channelId;
      video.audience = "official";
      if (!await verifyVideoUploader(video, cleanApiKey, timeoutMs, fetchImpl)) {
        warnings.push(`${lookup.artist.ticker}: Comment video uploader could not be verified.`);
        continue;
      }
      if (videoIndex > 0 && delayMs > 0) {
        await sleep(Math.max(100, Math.floor(delayMs / 2)));
      }

      const comments = await fetchBalancedVideoComments({
        apiKey: cleanApiKey,
        videoId: video.id,
        maxResults: maxCommentsPerVideo,
        runDate,
        timeoutMs,
        fetchImpl
      });

      if (comments.ok) {
        samples.push({
          video,
          comments: comments.comments,
          duplicateCopyCount: comments.duplicateCopyCount
        });
      } else {
        warnings.push(`${lookup.artist.ticker}: ${comments.error}`);
      }
    }

    if (videos.videos.length && samples.length === 0) {
      signals[lookup.artist.id] = buildErrorSignal(lookup.channelId, "All comment samples were unavailable.");
      observations.push(unavailableReception(lookup.artist.id, SOURCE, runDate));
      continue;
    }
    const signal = buildYoutubeCommentSignal({
      artist: lookup.artist,
      runDate,
      channelId: lookup.channelId,
      videos: videos.videos,
      samples,
      baseline: baselines[lookup.artist.id] ?? {},
      selectReception,
      maxCommentsPerVideo
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

function countIndependentComments(samples: VideoCommentSample[], runDate: string) {
  const seenComments = new Set<string>(), seenAuthors = new Set<string>(), seenCopies = new Set<string>();
  let duplicateCopyCount = samples.reduce((sum, sample) => sum + (sample.duplicateCopyCount ?? 0), 0);
  const comments = samples.flatMap((sample) => sample.comments)
    .filter(comment => isRecentDate(comment.publishedAt, runDate, 7))
    .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
    .filter(comment => {
      const id = comment.id ?? `${comment.authorId ?? ""}:${comment.publishedAt}:${comment.text}`;
      if (seenComments.has(id) || (comment.authorId && seenAuthors.has(comment.authorId))) return false;
      const copy = getLongReactionCopyKey(comment.text);
      if (copy && seenCopies.has(copy)) { duplicateCopyCount++; return false; }
      if (copy) seenCopies.add(copy);
      seenComments.add(id);
      if (comment.authorId) seenAuthors.add(comment.authorId);
      return true;
    });
  return { comments, duplicateCopyCount, uniqueAuthorCount: seenAuthors.size };
}

function buildYoutubeCommentSignal({
  artist,
  runDate,
  channelId,
  videos,
  samples,
  baseline,
  selectReception,
  maxCommentsPerVideo
}: {
  artist: MarketUpdateArtist;
  runDate: string;
  channelId: string;
  videos: YoutubeVideo[];
  samples: VideoCommentSample[];
  baseline: Record<string, number>;
  selectReception: ReturnType<typeof createArtistReceptionSelector>;
  maxCommentsPerVideo: number;
}): {
  signal: AdapterSignal;
  observations: MarketObservation[];
} {
  const { comments, duplicateCopyCount, uniqueAuthorCount } = countIndependentComments(samples, runDate);
  const catalogueComments = new Set(samples.filter(sample => sample.video.catalogueFallback).flatMap(sample => sample.comments));
  const catalogueCommentCount = comments.filter(comment => catalogueComments.has(comment)).length;
  const scored = comments
    .map((comment) => ({
      sentiment: scoreCommentSentiment(selectReception(comment.text, artist)),
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
  const sampleScope = getSampleScope([...samples.map(sample => `${sample.video.id}:${sample.video.catalogueFallback ? "catalogue" : "recent"}`), `limit:${maxCommentsPerVideo}`]);
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
    // The pricing engine differences this level once. Including a precomputed
    // change here would difference momentum twice and create a false reversal
    // tomorrow when an unchanged audience opinion loses today's momentum term.
    stats.socialGrowth = clamp(absoluteReaction, -45, 45);
  }

  const rawPayload = {
    source: SOURCE,
    runDate,
    channelId,
    sampledVideoCount: samples.length,
    catalogueFallbackVideoCount: samples.filter(sample => sample.video.catalogueFallback).length,
    catalogueFallbackCommentCount: catalogueCommentCount,
    recentVideoCount: videos.length,
    sampledCommentCount: commentCount,
    classifiedCommentCount,
    unclassifiedCommentCount: commentCount - classifiedCommentCount,
    uniqueAuthorCount,
    samplingVersion: SAMPLING_VERSION,
    pricingInputVersion: 2,
    duplicateCopyCount,
    candidatesPerOrder: 100,
    maxCommentsPerVideo,
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
    selectionBias: samples.some(sample => sample.video.catalogueFallback) ? "older_recording_audiences" : samples.some(sample => sample.video.audience === "editorial") ? "official_and_trusted_editorial_channels" : "artist_owned_channel_core_fans",
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
    createObservation(artist.id, runDate, "sample_scope", sampleScope, "cohort", rawPayload),
    createObservation(artist.id, runDate, "classified_comment_count", classifiedCommentCount, "comments", rawPayload),
    createObservation(artist.id, runDate, "catalogue_video_count", rawPayload.catalogueFallbackVideoCount, "videos", rawPayload),
    createObservation(artist.id, runDate, "reception_available", hasEnoughComments ? 1 : 0, "boolean", rawPayload)
  ];

  return {
    signal: {
      stats,
      rawPayload,
      confidence: hasEnoughComments ? getSignalConfidence(classifiedCommentCount, commentLikeCount) *
        (1 - 0.5 * catalogueCommentCount / Math.max(1, commentCount)) : 0
    },
    observations: hasEnoughComments ? observations : observations.filter(observation => [COMMENT_COUNT, "classified_comment_count", "catalogue_video_count", "reception_available", "sampling_version", "sample_scope"].includes(observation.metric))
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

async function fetchBalancedVideoComments(options: Parameters<typeof fetchVideoComments>[0] & { runDate: string }) {
  const limit = clampInteger(options.maxResults, 1, 100);
  // Request the API's full page in the same two calls. Apply the configured cap
  // after freshness and duplication checks so old top comments do not crowd out
  // recent reactions. Interleave the two orders to retain balanced selection.
  const results = await Promise.all(["time", "relevance"].map(order => fetchVideoComments({ ...options, maxResults: 100, order: order as "time" | "relevance" })));
  const successful = results.filter((result): result is { ok: true; comments: YoutubeComment[] } => result.ok);
  if (successful.length !== results.length) return { ok: false as const, error: results.find(result => !result.ok)?.error ?? "Comments unavailable." };
  const lists = successful.map(result => result.comments.filter(comment => isRecentDate(comment.publishedAt, options.runDate, 7)));
  const selected: YoutubeComment[] = [], seen = new Set<string>(), authors = new Set<string>(), copies = new Set<string>();
  let duplicateCopyCount = 0;
  for (let index = 0; index < Math.max(...lists.map(list => list.length)) && selected.length < limit; index++) {
    for (const list of lists) {
      const comment = list[index];
      if (!comment || selected.length >= limit) continue;
      const id = comment.id ?? `${comment.authorId}:${comment.publishedAt}:${comment.text}`;
      if (seen.has(id)) continue;
      seen.add(id);
      if (comment.authorId && authors.has(comment.authorId)) continue;
      const copy = getLongReactionCopyKey(comment.text);
      if (copy && copies.has(copy)) { duplicateCopyCount++; continue; }
      if (copy) copies.add(copy);
      if (comment.authorId) authors.add(comment.authorId);
      selected.push(comment);
    }
  }
  return { ok: true as const, comments: selected, duplicateCopyCount };
}

function isRecentDate(value: string | undefined, runDate: string, days: number) {
  const observed = Date.parse(value ?? ""), end = Math.min(Date.now(), Date.parse(`${runDate}T23:59:59.999Z`));
  return Number.isFinite(observed) && Number.isFinite(end) && observed <= end && observed >= end - days * 86400000;
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
  url.searchParams.set("maxResults", String(clampInteger(maxResults, 1, 50)));
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

async function fetchCatalogueRecordings({ artist, channelId, playlistId, runDate, apiKey, limit, timeoutMs, fetchImpl }: {
  artist: MarketUpdateArtist; channelId: string; playlistId: string; runDate: string; apiKey: string; limit: number; timeoutMs: number; fetchImpl: typeof fetch;
}): Promise<YoutubeVideo[]> {
  const uploads = await fetchRecentUploadedVideos({ apiKey, playlistId, maxResults: 50, timeoutMs, fetchImpl });
  if (!uploads.ok || !uploads.videos.length) return [];
  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.search = new URLSearchParams({ part: "snippet,contentDetails,status,statistics", id: uploads.videos.map(video => video.id).join(","), key: apiKey }).toString();
  const metadata = await fetchJson({ url: url.toString(), timeoutMs, fetchImpl });
  if (!metadata.ok) return [];
  const items = (metadata.value as { items?: Array<{ id?: string; snippet?: { title?: string; description?: string; channelId?: string; categoryId?: string; publishedAt?: string }; contentDetails?: { duration?: string }; status?: { privacyStatus?: string }; statistics?: { commentCount?: string } }> }).items;
  if (!Array.isArray(items)) return [];
  const recordings = items.flatMap(item => {
    const snippet = item.snippet, title = snippet?.title, duration = item.contentDetails?.duration;
    if (!item.id || !uploads.videos.some(video => video.id === item.id) || !title || snippet?.channelId !== channelId ||
      item.status?.privacyStatus !== "public" || !duration || (parseIsoDurationSeconds(duration) ?? 0) <= 75 ||
      !Number.isFinite(Date.parse(snippet.publishedAt ?? "")) || Date.parse(snippet.publishedAt!) > Date.now() ||
      /\b(?:trailer|teaser|podcast|interview|recap|announcement|shorts|merch)\b/i.test(title)) return [];
    if (snippet.categoryId !== "10" && !/\b(?:official (?:music )?(?:video|audio)|visuali[sz]er|lyrics? video)\b/i.test(title)) return [];
    // Label channels can upload someone else's song. Explicit performer credits
    // must include this artist; channel ownership alone cannot override them.
    if ((/\s+[-–—]\s+/.test(title) || /^(?:artists?|performers?|performed by|vocals(?: by)?)\s*:/im.test(snippet.description ?? "")) &&
      !resolveRecordingArtists({ title, description: snippet.description, primaryArtistId: "", artists: [artist] }).length) return [];
    return [{ id: item.id, title, publishedAt: snippet.publishedAt, channelId, audience: "official" as const, catalogueFallback: !isRecentDate(snippet.publishedAt, runDate, 90),
      catalogueCommentCount: /^\d+$/.test(item.statistics?.commentCount ?? "") ? Number(item.statistics!.commentCount) : undefined }];
  }).sort((first, second) => (second.publishedAt ?? "").localeCompare(first.publishedAt ?? ""));
  // Mix recent uploads with heavily discussed recordings. Lifetime volume is
  // only a discovery priority; only actual last-seven-day reactions are scored.
  const discussed = [...recordings].sort((a, b) => (b.catalogueCommentCount ?? 0) - (a.catalogueCommentCount ?? 0));
  const seen = new Set<string>();
  return recordings.flatMap((video, index) => [video, discussed[index]]).filter(video => {
    if (!video || seen.has(video.id)) return false;
    seen.add(video.id); return true;
  }).slice(0, Math.min(12, Math.max(0, limit)));
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
