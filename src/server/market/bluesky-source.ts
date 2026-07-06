import { clamp } from "@/lib/pricing";
import type { MarketUpdateArtist } from "@/server/market/daily-update";
import { buildDefaultGdeltQuery } from "@/server/market/artist-text-identifiers";
import { buildCommunityEventTitle, getCommunityEventLabel } from "@/server/market/event-title";
import {
  classifyArtistStatusText,
  type ArtistStatusSeverity,
  type ArtistStatusSubtype
} from "@/server/market/status-events";
import type {
  AdapterSignal,
  AdapterSignals,
  ArtistExternalIds,
  MarketEvent,
  MarketObservation,
  ObservationBaselines
} from "@/server/market/market-data";
import type { HypeStats } from "@/lib/types";

type BlueskyCollectOptions = {
  artists: MarketUpdateArtist[];
  runDate: string;
  externalIds?: Record<string, ArtistExternalIds>;
  baselines?: ObservationBaselines;
  postsPerArtist?: number;
  lookbackDays?: number;
  delayMs?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

type BlueskyPostResponse = {
  posts?: BlueskyPostData[];
  error?: string;
  message?: string;
};

type BlueskyPostData = {
  uri?: string;
  cid?: string;
  author?: {
    handle?: string;
    displayName?: string;
  };
  record?: {
    text?: string;
    createdAt?: string;
  };
  likeCount?: number;
  repostCount?: number;
  replyCount?: number;
  quoteCount?: number;
  indexedAt?: string;
  labels?: Array<{ val?: string }>;
};

type BlueskyPost = {
  id: string;
  text: string;
  authorHandle: string;
  authorDisplayName: string | null;
  createdDate: string;
  sourceUrl: string;
  likes: number;
  reposts: number;
  replies: number;
  quotes: number;
  engagement: number;
  matchConfidence: number;
};

type BlueskyPostClassification = {
  eventType: MarketEvent["eventType"] | null;
  sentimentScore: number;
  impactScore: number;
  confidence: number;
  reason: string;
  catalyst: boolean;
  negative: boolean;
  hype: boolean;
  statusSubtype?: ArtistStatusSubtype;
  statusSeverity?: ArtistStatusSeverity;
  statusHaltRecommended?: boolean;
};

export type BlueskyMarketSignals = {
  signals: AdapterSignals;
  observations: MarketObservation[];
  eventsByArtist: Record<string, MarketEvent[]>;
  warnings: string[];
};

const SOURCE = "bluesky";
const POST_COUNT = "post_count";
const ENGAGEMENT_SCORE = "engagement_score";
const HYPE_POST_COUNT = "hype_post_count";
const NEGATIVE_POST_COUNT = "negative_post_count";
const CATALYST_POST_COUNT = "catalyst_post_count";
const UNIQUE_AUTHOR_COUNT = "unique_author_count";
const TOP_POST_ENGAGEMENT = "top_post_engagement";
const AVERAGE_SENTIMENT = "average_sentiment";
const REQUEST_ERROR = "request_error";
const SEARCH_SORTS = ["latest"] as const;

export async function collectBlueskyMarketSignals({
  artists,
  runDate,
  externalIds = {},
  baselines = {},
  postsPerArtist = 20,
  lookbackDays = 7,
  delayMs = 250,
  timeoutMs = 9000,
  fetchImpl = fetch
}: BlueskyCollectOptions): Promise<BlueskyMarketSignals> {
  const signals: AdapterSignals = {};
  const observations: MarketObservation[] = [];
  const eventsByArtist: Record<string, MarketEvent[]> = {};
  const warnings: string[] = [];

  for (const [index, artist] of artists.entries()) {
    if (index > 0 && delayMs > 0) {
      await sleep(delayMs);
    }

    const query = buildBlueskyQuery(artist, externalIds[artist.id]);
    const result = await fetchBlueskySearch({
      query,
      runDate,
      lookbackDays,
      postsPerArtist,
      timeoutMs,
      fetchImpl
    });

    if (!result.ok) {
      signals[artist.id] = {
        stats: {},
        rawPayload: {
          source: SOURCE,
          query,
          status: "error",
          error: result.error
        }
      };
      observations.push(
        createObservation(artist.id, runDate, REQUEST_ERROR, 1, "flag", {
          source: SOURCE,
          query,
          error: result.error
        })
      );
      warnings.push(`${artist.ticker}: ${result.error}`);
      continue;
    }

    const signal = buildBlueskySignal({
      artist,
      query,
      runDate,
      posts: result.posts,
      externalIds: externalIds[artist.id],
      baseline: baselines[artist.id] ?? {},
      lookbackDays
    });

    signals[artist.id] = signal.signal;
    observations.push(...signal.observations);

    if (signal.events.length) {
      eventsByArtist[artist.id] = signal.events;
    }
  }

  return {
    signals,
    observations,
    eventsByArtist,
    warnings
  };
}

function buildBlueskySignal({
  artist,
  query,
  runDate,
  posts,
  externalIds,
  baseline,
  lookbackDays
}: {
  artist: MarketUpdateArtist;
  query: string;
  runDate: string;
  posts: BlueskyPostData[];
  externalIds?: ArtistExternalIds;
  baseline: Record<string, number>;
  lookbackDays: number;
}): {
  signal: AdapterSignal;
  observations: MarketObservation[];
  events: MarketEvent[];
} {
  const names = buildArtistNameCandidates(artist, externalIds);
  const matchedPosts = posts
    .map((post) => normalizeBlueskyPost(post))
    .filter((post): post is BlueskyPost => Boolean(post))
    .filter((post) => isWithinLookback(post.createdDate, runDate, lookbackDays))
    .map((post) => ({
      ...post,
      matchConfidence: getArtistMentionConfidence(post, names)
    }))
    .filter((post) => post.matchConfidence > 0);
  const classifiedPosts = matchedPosts.map((post) => ({
    post,
    classification: classifyBlueskyPost(post)
  }));
  const uniqueAuthors = new Set(matchedPosts.map((post) => post.authorHandle.toLowerCase()));
  const postCount = matchedPosts.length;
  const engagementScore = matchedPosts.reduce((total, post) => total + post.engagement, 0);
  const topPostEngagement = matchedPosts.reduce((highest, post) => Math.max(highest, post.engagement), 0);
  const hypePostCount = classifiedPosts.filter(({ classification }) => classification.hype).length;
  const negativePostCount = classifiedPosts.filter(({ classification }) => classification.negative).length;
  const catalystPostCount = classifiedPosts.filter(({ classification }) => classification.catalyst).length;
  const averageSentiment =
    classifiedPosts.reduce((total, item) => total + item.classification.sentimentScore, 0) /
    Math.max(1, classifiedPosts.length);
  const postMomentum = calculateMomentum(postCount, baseline[POST_COUNT], {
    firstRunValueScale: 13,
    firstRunFloor: 2,
    firstRunMinValue: 3
  });
  const engagementMomentum = calculateMomentum(engagementScore, baseline[ENGAGEMENT_SCORE], {
    firstRunValueScale: 15,
    firstRunFloor: 22,
    firstRunMinValue: 45
  });
  const hypeMomentum = calculateMomentum(hypePostCount, baseline[HYPE_POST_COUNT], {
    firstRunValueScale: 14,
    firstRunFloor: 1,
    firstRunMinValue: 2
  });
  const negativeMomentum = calculateMomentum(negativePostCount, baseline[NEGATIVE_POST_COUNT], {
    firstRunValueScale: 15,
    firstRunFloor: 1,
    firstRunMinValue: 2
  });
  const eventImpact = classifiedPosts.reduce(
    (total, item) => total + getPostEventImpact(item.post, item.classification),
    0
  );
  const stats = buildStatsFromBluesky({
    postMomentum,
    engagementMomentum,
    hypeMomentum,
    negativeMomentum,
    eventImpact,
    postCount,
    engagementScore,
    catalystPostCount,
    negativePostCount,
    uniqueAuthorCount: uniqueAuthors.size,
    averageSentiment
  });
  const confidence = getBlueskySignalConfidence({
    postCount,
    engagementScore,
    uniqueAuthorCount: uniqueAuthors.size,
    topPostEngagement,
    hasBaseline: typeof baseline[ENGAGEMENT_SCORE] === "number" && baseline[ENGAGEMENT_SCORE] > 0,
    hasCatalyst: catalystPostCount > 0,
    names
  });
  const rawPayload = {
    source: SOURCE,
    query,
    runDate,
    postCount,
    engagementScore,
    hypePostCount,
    negativePostCount,
    catalystPostCount,
    uniqueAuthorCount: uniqueAuthors.size,
    topPostEngagement,
    averageSentiment,
    baselinePostCount: baseline[POST_COUNT] ?? null,
    baselineEngagementScore: baseline[ENGAGEMENT_SCORE] ?? null,
    postMomentum,
    engagementMomentum,
    hypeMomentum,
    negativeMomentum,
    eventImpact,
    status: Object.keys(stats).length ? "ok" : "baseline_only",
    topPosts: classifiedPosts
      .sort((a, b) => b.post.engagement - a.post.engagement)
      .slice(0, 5)
      .map(({ post, classification }) => ({
        signalLabel: getCommunityEventLabel(classification.eventType, classification.reason),
        sourceUrl: post.sourceUrl,
        authorHandle: post.authorHandle,
        createdDate: post.createdDate,
        likes: post.likes,
        reposts: post.reposts,
        replies: post.replies,
        quotes: post.quotes,
        engagement: post.engagement,
        viralityTier: getEngagementTier(post.engagement),
        matchConfidence: post.matchConfidence,
        sentimentScore: classification.sentimentScore,
        impactScore: classification.impactScore,
        reason: classification.reason
      }))
  };

  return {
    signal: {
      stats,
      confidence,
      rawPayload
    },
    observations: [
      createObservation(artist.id, runDate, POST_COUNT, postCount, "posts", rawPayload),
      createObservation(artist.id, runDate, ENGAGEMENT_SCORE, engagementScore, "engagement", rawPayload),
      createObservation(artist.id, runDate, HYPE_POST_COUNT, hypePostCount, "posts", rawPayload),
      createObservation(artist.id, runDate, NEGATIVE_POST_COUNT, negativePostCount, "posts", rawPayload),
      createObservation(artist.id, runDate, CATALYST_POST_COUNT, catalystPostCount, "posts", rawPayload),
      createObservation(artist.id, runDate, UNIQUE_AUTHOR_COUNT, uniqueAuthors.size, "authors", rawPayload),
      createObservation(artist.id, runDate, TOP_POST_ENGAGEMENT, topPostEngagement, "engagement", rawPayload),
      createObservation(artist.id, runDate, AVERAGE_SENTIMENT, averageSentiment, "score", rawPayload)
    ],
    events: buildBlueskyEvents({
      artist,
      runDate,
      classifiedPosts
    })
  };
}

function buildStatsFromBluesky({
  postMomentum,
  engagementMomentum,
  hypeMomentum,
  negativeMomentum,
  eventImpact,
  postCount,
  engagementScore,
  catalystPostCount,
  negativePostCount,
  uniqueAuthorCount,
  averageSentiment
}: {
  postMomentum: number | undefined;
  engagementMomentum: number | undefined;
  hypeMomentum: number | undefined;
  negativeMomentum: number | undefined;
  eventImpact: number;
  postCount: number;
  engagementScore: number;
  catalystPostCount: number;
  negativePostCount: number;
  uniqueAuthorCount: number;
  averageSentiment: number;
}): Partial<HypeStats> {
  const hasConfirmedSignal =
    typeof postMomentum === "number" ||
    typeof engagementMomentum === "number" ||
    catalystPostCount > 0 ||
    negativePostCount > 0;

  if (!hasConfirmedSignal) {
    return {};
  }

  const postSignal = postMomentum ?? 0;
  const engagementSignal = engagementMomentum ?? 0;
  const hypeSignal = hypeMomentum ?? catalystPostCount * 7;
  const negativeSignal = negativeMomentum ?? negativePostCount * 8;
  const breadthSignal = clamp(uniqueAuthorCount * 2.5, 0, 18);
  const absoluteAttentionLift = clamp(Math.log10(engagementScore + 1) * 4.5 + postCount * 0.75, 0, 26);
  const catalystLift = catalystPostCount * 8 + Math.max(0, eventImpact) * 0.24;
  const negativeDrag = negativeSignal * 0.92 + negativePostCount * 5.5 + Math.max(0, -eventImpact) * 0.28;

  return {
    searchGrowth: clamp(
      engagementSignal * 0.32 + postSignal * 0.24 + breadthSignal + catalystLift * 0.34 - negativeDrag * 0.42,
      -35,
      100
    ),
    socialGrowth: clamp(
      engagementSignal * 0.58 + postSignal * 0.18 + hypeSignal * 0.5 + catalystLift + breadthSignal - negativeDrag,
      -50,
      130
    ),
    newsScore: clamp(
      50 + eventImpact * 0.24 + averageSentiment * 0.18 + absoluteAttentionLift - negativeDrag * 0.32,
      0,
      100
    )
  };
}

function buildBlueskyEvents({
  artist,
  runDate,
  classifiedPosts
}: {
  artist: MarketUpdateArtist;
  runDate: string;
  classifiedPosts: Array<{ post: BlueskyPost; classification: BlueskyPostClassification }>;
}) {
  const candidates = classifiedPosts
    .filter(({ post, classification }) => {
      if (!classification.eventType || !classification.catalyst) {
        return false;
      }

      const engagementFloor = classification.negative ? 14 : 24;
      return post.engagement >= engagementFloor || Math.abs(classification.impactScore) >= 42;
    })
    .map(({ post, classification }) => {
      const engagementImpact = clamp(Math.log10(post.engagement + 1) * 16 - 10, 0, 42);
      const signedEngagementImpact = classification.impactScore >= 0 ? engagementImpact : -engagementImpact;

      return {
        post,
        classification,
        impactScore: clamp(classification.impactScore + signedEngagementImpact, -92, 96),
        confidence: clamp(classification.confidence + Math.log10(post.engagement + 1) * 0.055, 0.34, 0.82)
      };
    })
    .filter((candidate) => candidate.confidence >= 0.48)
    .sort((a, b) => Math.abs(b.impactScore) - Math.abs(a.impactScore))
    .slice(0, 3);

  return candidates.map(({ post, classification, impactScore, confidence }) => ({
    artistId: artist.id,
    eventDate: post.createdDate || runDate,
    eventType: classification.eventType ?? "viral",
    title: buildCommunityEventTitle({
      artistName: artist.name,
      eventType: classification.eventType,
      reason: classification.reason,
      source: "bluesky"
    }),
    sourceName: "Bluesky",
    sourceUrl: post.sourceUrl,
    sentimentScore: classification.sentimentScore,
    impactScore,
    confidence: clamp(confidence * post.matchConfidence, 0.32, 0.82),
    rawPayload: {
      source: "bluesky_post",
      authorHandle: post.authorHandle,
      authorDisplayName: post.authorDisplayName,
      likes: post.likes,
      reposts: post.reposts,
      replies: post.replies,
      quotes: post.quotes,
      engagement: post.engagement,
      viralityTier: getEngagementTier(post.engagement),
      matchConfidence: post.matchConfidence,
      classificationReason: classification.reason,
      statusSubtype: classification.statusSubtype ?? null,
      statusSeverity: classification.statusSeverity ?? null,
      statusHaltRecommended: classification.statusHaltRecommended ?? false
    }
  }));
}

function classifyBlueskyPost(post: BlueskyPost): BlueskyPostClassification {
  const text = normalizeText(post.text);
  const positiveMatches = countMatches(text, POSITIVE_TERMS);
  const negativeMatches = countMatches(text, NEGATIVE_TERMS);
  const hasAlbumAnnouncement = hasAny(text, ALBUM_ANNOUNCEMENT_TERMS);
  const hasTracklist = hasAny(text, TRACKLIST_TERMS);
  const hasSnippet = hasAny(text, SNIPPET_TERMS);
  const hasPerformance = hasAny(text, PERFORMANCE_TERMS);
  const hasFeature = hasAny(text, FEATURE_TERMS);
  const hasRelease = hasAny(text, RELEASE_TERMS);
  const hasReview = hasAny(text, REVIEW_TERMS);
  const hasBacklash = hasAny(text, BACKLASH_TERMS);
  const hasControversy = hasAny(text, CONTROVERSY_TERMS);
  const hasDecline = hasAny(text, DECLINE_TERMS);
  const hasViral = hasAny(text, VIRAL_TERMS);
  const hasChart = hasAny(text, CHART_TERMS);
  const negative = negativeMatches > positiveMatches || hasDecline || hasBacklash || hasControversy;
  const hype =
    hasAlbumAnnouncement ||
    hasTracklist ||
    hasSnippet ||
    hasPerformance ||
    hasFeature ||
    hasRelease ||
    hasChart ||
    hasViral ||
    positiveMatches > 0;
  const sentimentScore = clamp((positiveMatches - negativeMatches) * 15 + (hype ? 10 : 0) - (negative ? 22 : 0), -90, 86);
  const engagementImpact = clamp(Math.log10(post.engagement + 1) * 8, 0, 32);
  const status = classifyArtistStatusText(text, { engagementImpact });

  if (status) {
    return {
      eventType: status.eventType,
      sentimentScore: status.sentimentScore,
      impactScore: status.impactScore,
      confidence: status.baseConfidence,
      reason: status.reason,
      catalyst: true,
      negative: status.impactScore < 0 || status.sentimentScore < -20,
      hype: status.impactScore > 0,
      statusSubtype: status.statusSubtype,
      statusSeverity: status.statusSeverity,
      statusHaltRecommended: status.statusHaltRecommended
    };
  }

  if (hasBacklash || hasControversy) {
    return {
      eventType: "controversy",
      sentimentScore: clamp(Math.min(-28, sentimentScore - 24), -96, 10),
      impactScore: clamp(Math.min(-32, sentimentScore - 20) - engagementImpact * 0.7, -96, 8),
      confidence: hasBacklash ? 0.68 : 0.62,
      reason: hasBacklash ? "backlash_terms" : "controversy_terms",
      catalyst: true,
      negative: true,
      hype
    };
  }

  if (hasReview) {
    return {
      eventType: "review",
      sentimentScore,
      impactScore: clamp(sentimentScore + (sentimentScore >= 0 ? engagementImpact : -engagementImpact), -90, 90),
      confidence: 0.58,
      reason: "review_terms",
      catalyst: true,
      negative,
      hype
    };
  }

  if (hasTracklist) {
    return {
      eventType: "news",
      sentimentScore: clamp(sentimentScore, -82, 82),
      impactScore: clamp(sentimentScore + (sentimentScore >= 0 ? 20 : -20) + engagementImpact * (sentimentScore >= 0 ? 0.45 : -0.45), -86, 86),
      confidence: 0.6,
      reason: "tracklist_terms",
      catalyst: true,
      negative,
      hype: sentimentScore >= 0
    };
  }

  if (hasAlbumAnnouncement || hasRelease) {
    return {
      eventType: "release",
      sentimentScore: clamp(22 + sentimentScore * 0.62, -48, 84),
      impactScore: clamp(34 + engagementImpact + sentimentScore * 0.35, -38, 90),
      confidence: hasAlbumAnnouncement ? 0.68 : 0.62,
      reason: hasAlbumAnnouncement ? "album_announcement_terms" : "release_terms",
      catalyst: true,
      negative,
      hype: true
    };
  }

  if (hasDecline && negative) {
    return {
      eventType: "news",
      sentimentScore: clamp(sentimentScore - 18, -88, 24),
      impactScore: clamp(sentimentScore - 12 - engagementImpact * 0.75, -90, 25),
      confidence: 0.58,
      reason: "decline_terms",
      catalyst: true,
      negative: true,
      hype: false
    };
  }

  if (hasFeature || hasPerformance || hasChart || hasSnippet || hasViral) {
    const reason = hasFeature
      ? "feature_terms"
      : hasPerformance
        ? "performance_terms"
        : hasChart
          ? "chart_terms"
          : hasSnippet
            ? "snippet_terms"
            : "viral_terms";
    const baseImpact = hasFeature ? 36 : hasPerformance ? 34 : hasChart ? 42 : hasSnippet ? 24 : 30;

    return {
      eventType: "viral",
      sentimentScore: clamp(18 + sentimentScore * 0.72, -58, 84),
      impactScore: clamp(baseImpact + engagementImpact + sentimentScore * 0.28, -40, 94),
      confidence: hasSnippet ? 0.54 : 0.62,
      reason,
      catalyst: true,
      negative,
      hype: true
    };
  }

  if (negativeMatches > 0) {
    return {
      eventType: null,
      sentimentScore: clamp(sentimentScore - 10, -84, 36),
      impactScore: clamp(sentimentScore - engagementImpact * 0.55, -84, 36),
      confidence: 0.44,
      reason: "negative_terms",
      catalyst: false,
      negative: true,
      hype: false
    };
  }

  return {
    eventType: null,
    sentimentScore,
    impactScore: clamp(sentimentScore * 0.48 + engagementImpact * 0.34, -35, 45),
    confidence: 0.4,
    reason: positiveMatches > 0 ? "positive_terms" : "discussion",
    catalyst: false,
    negative: false,
    hype
  };
}

function getPostEventImpact(post: BlueskyPost, classification: BlueskyPostClassification) {
  const engagementImpact = clamp(Math.log10(post.engagement + 1) * 9 - 5, 0, 34);
  const signedEngagementImpact = classification.impactScore >= 0 ? engagementImpact : -engagementImpact;

  return clamp((classification.impactScore + signedEngagementImpact) * classification.confidence, -88, 96);
}

async function fetchBlueskySearch({
  query,
  runDate,
  lookbackDays,
  postsPerArtist,
  timeoutMs,
  fetchImpl
}: {
  query: string;
  runDate: string;
  lookbackDays: number;
  postsPerArtist: number;
  timeoutMs: number;
  fetchImpl: typeof fetch;
}): Promise<{ ok: true; posts: BlueskyPostData[] } | { ok: false; error: string }> {
  const postsById = new Map<string, BlueskyPostData>();
  const errors: string[] = [];

  for (const sort of SEARCH_SORTS) {
    const result = await fetchBlueskySearchPage({
      query,
      sort,
      since: `${shiftDate(runDate, -lookbackDays)}T00:00:00.000Z`,
      postsPerArtist,
      timeoutMs,
      fetchImpl
    });

    if (!result.ok) {
      errors.push(result.error);
      continue;
    }

    for (const post of result.posts) {
      const key = post.uri ?? post.cid;

      if (key) {
        postsById.set(key, post);
      }
    }
  }

  if (postsById.size > 0 || errors.length < SEARCH_SORTS.length) {
    return {
      ok: true,
      posts: Array.from(postsById.values())
    };
  }

  return {
    ok: false,
    error: errors[0] ?? "Bluesky search returned no usable posts."
  };
}

async function fetchBlueskySearchPage({
  query,
  sort,
  since,
  postsPerArtist,
  timeoutMs,
  fetchImpl
}: {
  query: string;
  sort: "top" | "latest";
  since: string;
  postsPerArtist: number;
  timeoutMs: number;
  fetchImpl: typeof fetch;
}): Promise<{ ok: true; posts: BlueskyPostData[] } | { ok: false; error: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const url = new URL("https://api.bsky.app/xrpc/app.bsky.feed.searchPosts");

  url.searchParams.set("q", query);
  url.searchParams.set("sort", sort);
  url.searchParams.set("since", since);
  url.searchParams.set("limit", String(clampInteger(postsPerArtist, 5, 100)));

  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "rap-market-index/0.1 market research"
      }
    });
    const text = await response.text();
    const parsed = tryParseJson(text) as BlueskyPostResponse | null;

    if (!response.ok) {
      return {
        ok: false,
        error: parsed?.message
          ? `Bluesky ${sort} search failed: ${parsed.message}.`
          : `Bluesky ${sort} search failed with ${response.status}.`
      };
    }

    return {
      ok: true,
      posts: parsed?.posts ?? []
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : `Bluesky ${sort} search failed.`
    };
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeBlueskyPost(post: BlueskyPostData): BlueskyPost | null {
  const text = post.record?.text?.trim().replace(/\s+/g, " ");
  const createdDate = parseDate(post.record?.createdAt ?? post.indexedAt);
  const authorHandle = post.author?.handle?.trim() ?? "";

  if (!post.uri || !text || !createdDate || !authorHandle || hasBlockingLabel(post)) {
    return null;
  }

  const likes = Math.max(0, getNumber(post.likeCount) ?? 0);
  const reposts = Math.max(0, getNumber(post.repostCount) ?? 0);
  const replies = Math.max(0, getNumber(post.replyCount) ?? 0);
  const quotes = Math.max(0, getNumber(post.quoteCount) ?? 0);

  return {
    id: post.uri,
    text: text.slice(0, 600),
    authorHandle,
    authorDisplayName: post.author?.displayName?.trim() || null,
    createdDate,
    sourceUrl: buildPostUrl(post.uri, authorHandle),
    likes,
    reposts,
    replies,
    quotes,
    engagement: likes + reposts * 2 + quotes * 2 + replies,
    matchConfidence: 0
  };
}

function buildBlueskyQuery(artist: MarketUpdateArtist, externalIds?: ArtistExternalIds) {
  const query = externalIds?.gdeltQuery?.trim() || buildDefaultGdeltQuery(artist.name);
  const phrases = extractQuotedSearchPhrases(query);
  const name = phrases[0] ?? artist.name;
  const cleanName = name.replace(/"/g, "").trim();

  if (cleanName.split(/\s+/).length === 1 && cleanName.length <= 6) {
    return `"${cleanName}" rapper music album snippet tracklist`;
  }

  return `"${cleanName}"`;
}

function buildArtistNameCandidates(artist: MarketUpdateArtist, externalIds?: ArtistExternalIds) {
  const names = [
    artist.name,
    externalIds?.lastfmName,
    ...extractQuotedSearchPhrases(externalIds?.gdeltQuery)
  ].filter((value): value is string => Boolean(value?.trim()));

  return Array.from(new Set(names.map((value) => value.trim())));
}

function getArtistMentionConfidence(post: BlueskyPost, names: string[]) {
  const text = normalizeText(post.text);
  const compactText = text.replace(/\s+/g, "");
  const musicContext = hasMusicContext(text);

  for (const name of names) {
    const normalizedName = normalizeText(name);

    if (!normalizedName) {
      continue;
    }

    const compactName = normalizedName.replace(/\s+/g, "");
    const isShortName = compactName.length <= 3;
    const exactPattern = new RegExp(`(^|\\s)${escapeRegExp(normalizedName)}($|\\s)`);

    if (exactPattern.test(text)) {
      return isShortName && !musicContext ? 0 : isShortName ? 0.7 : 0.92;
    }

    if (!isShortName && compactName.length > 4 && compactText.includes(compactName)) {
      return 0.8;
    }
  }

  return 0;
}

function getBlueskySignalConfidence({
  postCount,
  engagementScore,
  uniqueAuthorCount,
  topPostEngagement,
  hasBaseline,
  hasCatalyst,
  names
}: {
  postCount: number;
  engagementScore: number;
  uniqueAuthorCount: number;
  topPostEngagement: number;
  hasBaseline: boolean;
  hasCatalyst: boolean;
  names: string[];
}) {
  const hasShortName = names.some((name) => normalizeText(name).replace(/\s+/g, "").length <= 3);
  const rawConfidence =
    0.28 +
    Math.log10(engagementScore + 1) * 0.068 +
    Math.min(0.13, postCount * 0.02) +
    Math.min(0.14, uniqueAuthorCount * 0.026) +
    Math.min(0.08, Math.log10(topPostEngagement + 1) * 0.03) +
    (hasBaseline ? 0.08 : 0) +
    (hasCatalyst ? 0.08 : 0);
  const shortNamePenalty = hasShortName ? 0.78 : 1;

  return clamp(rawConfidence * shortNamePenalty, 0.23, 0.78);
}

function calculateMomentum(
  value: number,
  baseline: number | undefined,
  {
    firstRunValueScale,
    firstRunFloor,
    firstRunMinValue
  }: {
    firstRunValueScale: number;
    firstRunFloor: number;
    firstRunMinValue: number;
  }
) {
  if (typeof baseline === "number" && baseline > 0) {
    return clamp(((value - baseline) / baseline) * 100, -65, 170);
  }

  if (value >= firstRunMinValue) {
    return clamp(Math.log10(value + 1) * firstRunValueScale - firstRunFloor, 0, 72);
  }

  return undefined;
}

function createObservation(
  artistId: string,
  observedDate: string,
  metric: string,
  value: number,
  unit: string,
  rawPayload: Record<string, unknown>
): MarketObservation {
  return {
    artistId,
    source: SOURCE,
    metric,
    observedDate,
    value,
    unit,
    rawPayload
  };
}

function hasBlockingLabel(post: BlueskyPostData) {
  return (post.labels ?? []).some((label) => {
    const value = label.val?.toLowerCase() ?? "";
    return value.includes("porn") || value.includes("sexual");
  });
}

function buildPostUrl(uri: string, handle: string) {
  const parts = uri.split("/");
  const postId = parts[parts.length - 1];

  return postId ? `https://bsky.app/profile/${handle}/post/${postId}` : `https://bsky.app/profile/${handle}`;
}

function isWithinLookback(date: string, runDate: string, lookbackDays: number) {
  const daysOld = daysBetween(date, runDate);

  return daysOld >= -1 && daysOld <= lookbackDays;
}

function daysBetween(start: string, end: string) {
  const startDate = new Date(`${start}T00:00:00.000Z`).getTime();
  const endDate = new Date(`${end}T00:00:00.000Z`).getTime();

  return Math.round((endDate - startDate) / 86400000);
}

function parseDate(value: string | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);

  return value.toISOString().slice(0, 10);
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\$/g, "s")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractQuotedSearchPhrases(query: string | undefined) {
  if (!query) {
    return [];
  }

  return Array.from(query.matchAll(/"([^"]+)"/g), (match) => match[1]?.trim()).filter((value): value is string =>
    Boolean(value)
  );
}

function hasMusicContext(text: string) {
  return hasAny(text, MUSIC_CONTEXT_TERMS);
}

function countMatches(value: string, terms: string[]) {
  return terms.reduce((count, term) => count + (value.includes(term) ? 1 : 0), 0);
}

function hasAny(value: string, terms: string[]) {
  return terms.some((term) => value.includes(term));
}

function getEngagementTier(engagement: number) {
  if (engagement >= 1500) {
    return "breakout";
  }

  if (engagement >= 500) {
    return "major";
  }

  if (engagement >= 100) {
    return "notable";
  }

  return "small";
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clampInteger(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.trunc(value)));
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

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

const MUSIC_CONTEXT_TERMS = [
  "album",
  "artist",
  "beat",
  "concert",
  "deluxe",
  "ep",
  "feature",
  "festival",
  "hip hop",
  "ig live",
  "mixtape",
  "music",
  "performance",
  "rapper",
  "release",
  "rolling loud",
  "song",
  "snippet",
  "track",
  "tracklist",
  "video"
];

const ALBUM_ANNOUNCEMENT_TERMS = [
  "album announcement",
  "album announced",
  "album coming",
  "album date",
  "album friday",
  "album next week",
  "album soon",
  "announced album",
  "announces album",
  "cover art",
  "deluxe announced",
  "dropping album",
  "new album",
  "new mixtape",
  "new project",
  "project announced",
  "release date"
];

const TRACKLIST_TERMS = [
  "feature list",
  "features are",
  "no features",
  "track list",
  "tracklist",
  "tracklist announced",
  "tracklist dropped",
  "tracklist reaction"
];

const RELEASE_TERMS = [
  "available now",
  "deluxe",
  "drops",
  "dropped",
  "ep",
  "mixtape",
  "music video",
  "new song",
  "new single",
  "out now",
  "pre save",
  "pre-save",
  "release",
  "released",
  "single"
];

const SNIPPET_TERMS = [
  "first listen",
  "grail",
  "ig live",
  "leak",
  "leaked",
  "preview",
  "previewed",
  "snippet",
  "snippets",
  "teaser",
  "unreleased"
];

const PERFORMANCE_TERMS = [
  "crowd went crazy",
  "crowd knew every word",
  "dead crowd",
  "festival",
  "live",
  "mosh pit",
  "moshpit",
  "performance",
  "performed",
  "rolling loud",
  "set went crazy",
  "stage",
  "viral performance"
];

const FEATURE_TERMS = [
  "co sign",
  "cosign",
  "collab",
  "collaboration",
  "drake feature",
  "feat",
  "feature",
  "feature on",
  "featured",
  "featuring",
  "guest verse",
  "opium co-sign",
  "verse",
  "with carti",
  "with drake",
  "with future",
  "with kendrick",
  "with travis"
];

const REVIEW_TERMS = [
  "album review",
  "best new music",
  "review",
  "reviewed",
  "song review",
  "track review"
];

const CHART_TERMS = [
  "billboard",
  "chart",
  "charts",
  "hot 100",
  "number 1",
  "spotify chart",
  "streaming record",
  "top 10"
];

const VIRAL_TERMS = [
  "blew up",
  "breakout",
  "challenge",
  "getting attention",
  "going viral",
  "goes viral",
  "meme",
  "next up",
  "tiktok",
  "trend",
  "trending",
  "viral",
  "viral clip"
];

const BACKLASH_TERMS = [
  "backlash",
  "boycott",
  "cancel him",
  "cancelled",
  "disrespectful",
  "fans angry",
  "fans are mad",
  "fans mad",
  "fans upset",
  "getting hate",
  "israel flag",
  "people are mad",
  "people mad",
  "problematic",
  "racist",
  "zionist"
];

const CONTROVERSY_TERMS = [
  "apology",
  "arrested",
  "beef",
  "charged",
  "controversial",
  "controversy",
  "diss",
  "lawsuit",
  "scandal",
  "sentenced"
];

const DECLINE_TERMS = [
  "dead crowd",
  "decline",
  "declined",
  "empty crowd",
  "fall off",
  "fallen off",
  "fell off",
  "flop",
  "flopped",
  "low sales",
  "lost hype",
  "lost momentum",
  "numbers down",
  "sales down",
  "streams down",
  "underperformed",
  "underperforming",
  "washed"
];

const POSITIVE_TERMS = [
  "amazing",
  "blew up",
  "classic",
  "co-sign",
  "cosign",
  "crazy",
  "fire",
  "goes hard",
  "grail",
  "hard",
  "hype",
  "insane",
  "killed",
  "love",
  "next up",
  "star",
  "went crazy"
];

const NEGATIVE_TERMS = [
  "bad",
  "boring",
  "dead crowd",
  "disappointing",
  "empty crowd",
  "fell off",
  "flop",
  "flopped",
  "hate",
  "lost hype",
  "lost momentum",
  "mid",
  "numbers down",
  "overrated",
  "streams down",
  "trash",
  "underperformed",
  "weak",
  "washed"
];
