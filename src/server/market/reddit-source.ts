import { clamp } from "@/lib/pricing";
import type { MarketUpdateArtist } from "@/server/market/daily-update";
import { buildDefaultGdeltQuery } from "@/server/market/artist-text-identifiers";
import type {
  AdapterSignal,
  AdapterSignals,
  ArtistExternalIds,
  MarketEvent,
  MarketObservation,
  ObservationBaselines
} from "@/server/market/market-data";
import type { HypeStats } from "@/lib/types";

type RedditCollectOptions = {
  artists: MarketUpdateArtist[];
  runDate: string;
  credentials?: {
    clientId?: string;
    clientSecret?: string;
    userAgent?: string;
  };
  externalIds?: Record<string, ArtistExternalIds>;
  baselines?: ObservationBaselines;
  subreddits?: string[];
  postsPerArtist?: number;
  lookbackDays?: number;
  delayMs?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

type RedditTokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: string;
};

type RedditListingResponse = {
  data?: {
    children?: Array<{
      data?: RedditPostData;
    }>;
  };
  message?: string;
  error?: unknown;
};

type RedditPostData = {
  id?: string;
  name?: string;
  title?: string;
  selftext?: string;
  subreddit?: string;
  permalink?: string;
  url?: string;
  author?: string;
  created_utc?: number;
  score?: number;
  ups?: number;
  num_comments?: number;
  upvote_ratio?: number;
  over_18?: boolean;
  removed_by_category?: string;
};

type RedditPost = {
  id: string;
  title: string;
  body: string;
  subreddit: string;
  permalink: string;
  createdDate: string;
  score: number;
  comments: number;
  upvoteRatio: number | null;
  engagement: number;
  matchConfidence: number;
  raw: RedditPostData;
};

type RedditPostClassification = {
  eventType: MarketEvent["eventType"] | null;
  sentimentScore: number;
  impactScore: number;
  confidence: number;
  reason: string;
  catalyst: boolean;
  negative: boolean;
  hype: boolean;
};

export type RedditMarketSignals = {
  signals: AdapterSignals;
  observations: MarketObservation[];
  eventsByArtist: Record<string, MarketEvent[]>;
  warnings: string[];
};

const SOURCE = "reddit";
const POST_COUNT = "post_count";
const ENGAGEMENT_SCORE = "engagement_score";
const HYPE_POST_COUNT = "hype_post_count";
const NEGATIVE_POST_COUNT = "negative_post_count";
const CATALYST_POST_COUNT = "catalyst_post_count";
const UNIQUE_SUBREDDIT_COUNT = "unique_subreddit_count";
const TOP_POST_ENGAGEMENT = "top_post_engagement";
const AVERAGE_SENTIMENT = "average_sentiment";
const REQUEST_ERROR = "request_error";
const DEFAULT_SUBREDDITS = ["hiphopheads", "rap", "undergroundhiphop", "playboicarti"];

export async function collectRedditMarketSignals({
  artists,
  runDate,
  credentials = {},
  externalIds = {},
  baselines = {},
  subreddits = DEFAULT_SUBREDDITS,
  postsPerArtist = 25,
  lookbackDays = 7,
  delayMs = 700,
  timeoutMs = 12000,
  fetchImpl = fetch
}: RedditCollectOptions): Promise<RedditMarketSignals> {
  const cleanClientId = credentials.clientId?.trim();
  const cleanClientSecret = credentials.clientSecret?.trim();
  const userAgent = credentials.userAgent?.trim() || "rap-market-index/0.1 market research";

  if (!cleanClientId || !cleanClientSecret) {
    return {
      signals: {},
      observations: [],
      eventsByArtist: {},
      warnings: ["Reddit credentials are not configured; skipped community hype signals."]
    };
  }

  const token = await fetchRedditAccessToken({
    clientId: cleanClientId,
    clientSecret: cleanClientSecret,
    userAgent,
    timeoutMs,
    fetchImpl
  });

  if (!token.ok) {
    return {
      signals: {},
      observations: [],
      eventsByArtist: {},
      warnings: [token.error]
    };
  }

  const cleanSubreddits = normalizeSubreddits(subreddits);
  const signals: AdapterSignals = {};
  const observations: MarketObservation[] = [];
  const eventsByArtist: Record<string, MarketEvent[]> = {};
  const warnings: string[] = credentials.userAgent?.trim()
    ? []
    : ["REDDIT_USER_AGENT is not configured; using the default market research user agent."];

  if (!cleanSubreddits.length) {
    return {
      signals,
      observations,
      eventsByArtist,
      warnings: ["No Reddit subreddits were configured; skipped community hype signals."]
    };
  }

  for (const [index, artist] of artists.entries()) {
    if (index > 0 && delayMs > 0) {
      await sleep(delayMs);
    }

    const query = buildRedditQuery(artist, externalIds[artist.id]);
    const result = await fetchRedditSearch({
      accessToken: token.accessToken,
      userAgent,
      subreddits: cleanSubreddits,
      query,
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
          subreddits: cleanSubreddits,
          status: "error",
          error: result.error
        }
      };
      observations.push(
        createObservation(artist.id, runDate, REQUEST_ERROR, 1, "flag", {
          source: SOURCE,
          query,
          subreddits: cleanSubreddits,
          error: result.error
        })
      );
      warnings.push(`${artist.ticker}: ${result.error}`);
      continue;
    }

    const signal = buildRedditSignal({
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

function buildRedditSignal({
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
  posts: RedditPostData[];
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
    .map((post) => normalizeRedditPost(post))
    .filter((post): post is RedditPost => Boolean(post))
    .filter((post) => isWithinLookback(post.createdDate, runDate, lookbackDays))
    .map((post) => ({
      ...post,
      matchConfidence: getArtistMentionConfidence(post, names)
    }))
    .filter((post) => post.matchConfidence > 0);
  const classifiedPosts = matchedPosts.map((post) => ({
    post,
    classification: classifyRedditPost(post)
  }));
  const uniqueSubreddits = new Set(matchedPosts.map((post) => post.subreddit.toLowerCase()));
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
    firstRunValueScale: 14,
    firstRunFloor: 2,
    firstRunMinValue: 3
  });
  const engagementMomentum = calculateMomentum(engagementScore, baseline[ENGAGEMENT_SCORE], {
    firstRunValueScale: 16,
    firstRunFloor: 28,
    firstRunMinValue: 80
  });
  const hypeMomentum = calculateMomentum(hypePostCount, baseline[HYPE_POST_COUNT], {
    firstRunValueScale: 15,
    firstRunFloor: 1,
    firstRunMinValue: 2
  });
  const negativeMomentum = calculateMomentum(negativePostCount, baseline[NEGATIVE_POST_COUNT], {
    firstRunValueScale: 16,
    firstRunFloor: 1,
    firstRunMinValue: 2
  });
  const eventImpact = classifiedPosts.reduce(
    (total, item) => total + getPostEventImpact(item.post, item.classification),
    0
  );
  const stats = buildStatsFromReddit({
    postMomentum,
    engagementMomentum,
    hypeMomentum,
    negativeMomentum,
    eventImpact,
    postCount,
    engagementScore,
    catalystPostCount,
    negativePostCount,
    uniqueSubredditCount: uniqueSubreddits.size,
    averageSentiment
  });
  const confidence = getRedditSignalConfidence({
    postCount,
    engagementScore,
    uniqueSubredditCount: uniqueSubreddits.size,
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
    uniqueSubredditCount: uniqueSubreddits.size,
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
        title: post.title,
        subreddit: post.subreddit,
        permalink: post.permalink,
        createdDate: post.createdDate,
        score: post.score,
        comments: post.comments,
        engagement: post.engagement,
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
      createObservation(artist.id, runDate, UNIQUE_SUBREDDIT_COUNT, uniqueSubreddits.size, "subreddits", rawPayload),
      createObservation(artist.id, runDate, TOP_POST_ENGAGEMENT, topPostEngagement, "engagement", rawPayload),
      createObservation(artist.id, runDate, AVERAGE_SENTIMENT, averageSentiment, "score", rawPayload)
    ],
    events: buildRedditEvents({
      artist,
      runDate,
      classifiedPosts
    })
  };
}

function buildStatsFromReddit({
  postMomentum,
  engagementMomentum,
  hypeMomentum,
  negativeMomentum,
  eventImpact,
  postCount,
  engagementScore,
  catalystPostCount,
  negativePostCount,
  uniqueSubredditCount,
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
  uniqueSubredditCount: number;
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
  const negativeSignal = negativeMomentum ?? negativePostCount * 7;
  const breadthSignal = clamp(uniqueSubredditCount * 4, 0, 18);
  const absoluteAttentionLift = clamp(Math.log10(engagementScore + 1) * 4 + postCount * 0.8, 0, 24);
  const catalystLift = catalystPostCount * 7 + Math.max(0, eventImpact) * 0.22;
  const negativeDrag = negativeSignal * 0.8 + negativePostCount * 5 + Math.max(0, -eventImpact) * 0.22;

  return {
    searchGrowth: clamp(
      engagementSignal * 0.35 + postSignal * 0.28 + breadthSignal + catalystLift * 0.35 - negativeDrag * 0.35,
      -35,
      100
    ),
    socialGrowth: clamp(
      engagementSignal * 0.52 + postSignal * 0.22 + hypeSignal * 0.5 + catalystLift + breadthSignal - negativeDrag,
      -45,
      125
    ),
    newsScore: clamp(
      50 + eventImpact * 0.22 + averageSentiment * 0.18 + absoluteAttentionLift - negativeDrag * 0.25,
      0,
      100
    )
  };
}

function buildRedditEvents({
  artist,
  runDate,
  classifiedPosts
}: {
  artist: MarketUpdateArtist;
  runDate: string;
  classifiedPosts: Array<{ post: RedditPost; classification: RedditPostClassification }>;
}) {
  const candidates = classifiedPosts
    .filter(({ post, classification }) => {
      if (!classification.eventType || !classification.catalyst) {
        return false;
      }

      const engagementFloor = classification.negative ? 45 : 65;
      const highAuthoritySmallPost =
        getSubredditTier(post.subreddit) >= 2 && post.engagement >= Math.max(30, engagementFloor - 25);

      return post.engagement >= engagementFloor || highAuthoritySmallPost;
    })
    .map(({ post, classification }) => {
      const engagementImpact = clamp(Math.log10(post.engagement + 1) * 15 - 12, 0, 45);
      const signedEngagementImpact = classification.impactScore >= 0 ? engagementImpact : -engagementImpact;
      const sourceTier = getSubredditTier(post.subreddit);

      return {
        post,
        classification,
        impactScore: clamp(classification.impactScore + signedEngagementImpact, -90, 95),
        confidence: clamp(
          classification.confidence + sourceTier * 0.045 + Math.log10(post.engagement + 1) * 0.05,
          0.36,
          0.86
        )
      };
    })
    .filter((candidate) => candidate.confidence >= 0.5)
    .sort((a, b) => Math.abs(b.impactScore) - Math.abs(a.impactScore))
    .slice(0, 2);

  return candidates.map(({ post, classification, impactScore, confidence }) => ({
    artistId: artist.id,
    eventDate: post.createdDate || runDate,
    eventType: classification.eventType ?? "viral",
    title: post.title.slice(0, 160),
    sourceName: `reddit/${post.subreddit}`,
    sourceUrl: post.permalink,
    sentimentScore: classification.sentimentScore,
    impactScore,
    confidence: clamp(confidence * post.matchConfidence, 0.35, 0.86),
    rawPayload: {
      source: "reddit_post",
      subreddit: post.subreddit,
      score: post.score,
      comments: post.comments,
      engagement: post.engagement,
      upvoteRatio: post.upvoteRatio,
      matchConfidence: post.matchConfidence,
      classificationReason: classification.reason
    }
  }));
}

function classifyRedditPost(post: RedditPost): RedditPostClassification {
  const text = normalizeText(`${post.title} ${post.body}`);
  const positiveMatches = countMatches(text, POSITIVE_TERMS);
  const negativeMatches = countMatches(text, NEGATIVE_TERMS);
  const hasSnippet = hasAny(text, SNIPPET_TERMS);
  const hasPerformance = hasAny(text, PERFORMANCE_TERMS);
  const hasFeature = hasAny(text, FEATURE_TERMS);
  const hasRelease = hasAny(text, RELEASE_TERMS);
  const hasReview = hasAny(text, REVIEW_TERMS);
  const hasControversy = hasAny(text, CONTROVERSY_TERMS);
  const hasChart = hasAny(text, CHART_TERMS);
  const hasViral = hasAny(text, VIRAL_TERMS);
  const hasDecline = hasAny(text, DECLINE_TERMS);
  const hype = hasSnippet || hasPerformance || hasFeature || hasRelease || hasChart || hasViral || positiveMatches > 0;
  const negative = negativeMatches > positiveMatches || hasDecline || hasControversy;
  const sentimentScore = clamp((positiveMatches - negativeMatches) * 14 + (hype ? 10 : 0) - (hasDecline ? 18 : 0), -80, 80);
  const engagementImpact = clamp(Math.log10(post.engagement + 1) * 7, 0, 30);

  if (hasControversy) {
    return {
      eventType: "controversy",
      sentimentScore: clamp(Math.min(-25, sentimentScore - 25), -95, 15),
      impactScore: clamp(Math.min(-28, sentimentScore - 18) - engagementImpact * 0.6, -95, 10),
      confidence: 0.66,
      reason: "controversy_terms",
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
      confidence: 0.6,
      reason: "review_terms",
      catalyst: true,
      negative,
      hype
    };
  }

  if (hasRelease) {
    return {
      eventType: "release",
      sentimentScore: clamp(22 + sentimentScore * 0.6, -45, 82),
      impactScore: clamp(32 + engagementImpact + sentimentScore * 0.35, -35, 88),
      confidence: 0.66,
      reason: "release_terms",
      catalyst: true,
      negative,
      hype: true
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
      sentimentScore: clamp(18 + sentimentScore * 0.7, -55, 82),
      impactScore: clamp(baseImpact + engagementImpact + sentimentScore * 0.3, -35, 92),
      confidence: hasSnippet ? 0.56 : 0.64,
      reason,
      catalyst: true,
      negative,
      hype: true
    };
  }

  if (hasDecline || negativeMatches > 0) {
    return {
      eventType: "news",
      sentimentScore: clamp(sentimentScore - 12, -85, 35),
      impactScore: clamp(sentimentScore - engagementImpact * 0.6, -85, 35),
      confidence: 0.52,
      reason: hasDecline ? "decline_terms" : "negative_terms",
      catalyst: hasDecline,
      negative: true,
      hype: false
    };
  }

  return {
    eventType: null,
    sentimentScore,
    impactScore: clamp(sentimentScore * 0.5 + engagementImpact * 0.35, -35, 45),
    confidence: 0.42,
    reason: positiveMatches > 0 ? "positive_terms" : "discussion",
    catalyst: false,
    negative: false,
    hype
  };
}

function getPostEventImpact(post: RedditPost, classification: RedditPostClassification) {
  const engagementImpact = clamp(Math.log10(post.engagement + 1) * 10 - 8, 0, 38);
  const signedEngagementImpact = classification.impactScore >= 0 ? engagementImpact : -engagementImpact;

  return clamp((classification.impactScore + signedEngagementImpact) * classification.confidence, -85, 95);
}

function getRedditSignalConfidence({
  postCount,
  engagementScore,
  uniqueSubredditCount,
  topPostEngagement,
  hasBaseline,
  hasCatalyst,
  names
}: {
  postCount: number;
  engagementScore: number;
  uniqueSubredditCount: number;
  topPostEngagement: number;
  hasBaseline: boolean;
  hasCatalyst: boolean;
  names: string[];
}) {
  const hasShortName = names.some((name) => normalizeText(name).replace(/\s+/g, "").length <= 3);
  const rawConfidence =
    0.3 +
    Math.log10(engagementScore + 1) * 0.07 +
    Math.min(0.14, postCount * 0.022) +
    Math.min(0.16, uniqueSubredditCount * 0.045) +
    Math.min(0.08, Math.log10(topPostEngagement + 1) * 0.025) +
    (hasBaseline ? 0.08 : 0) +
    (hasCatalyst ? 0.07 : 0);
  const shortNamePenalty = hasShortName ? 0.82 : 1;

  return clamp(rawConfidence * shortNamePenalty, 0.25, 0.82);
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
    return clamp(((value - baseline) / baseline) * 100, -60, 160);
  }

  if (value >= firstRunMinValue) {
    return clamp(Math.log10(value + 1) * firstRunValueScale - firstRunFloor, 0, 70);
  }

  return undefined;
}

async function fetchRedditAccessToken({
  clientId,
  clientSecret,
  userAgent,
  timeoutMs,
  fetchImpl
}: {
  clientId: string;
  clientSecret: string;
  userAgent: string;
  timeoutMs: number;
  fetchImpl: typeof fetch;
}): Promise<{ ok: true; accessToken: string } | { ok: false; error: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      signal: controller.signal,
      headers: {
        authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": userAgent
      },
      body: new URLSearchParams({
        grant_type: "client_credentials"
      })
    });
    const text = await response.text();
    const parsed = tryParseJson(text) as RedditTokenResponse | null;

    if (!response.ok || !parsed?.access_token) {
      return {
        ok: false,
        error: parsed?.error
          ? `Reddit token request failed: ${parsed.error}.`
          : `Reddit token request failed with ${response.status}.`
      };
    }

    return {
      ok: true,
      accessToken: parsed.access_token
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Reddit token request failed."
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchRedditSearch({
  accessToken,
  userAgent,
  subreddits,
  query,
  postsPerArtist,
  timeoutMs,
  fetchImpl
}: {
  accessToken: string;
  userAgent: string;
  subreddits: string[];
  query: string;
  postsPerArtist: number;
  timeoutMs: number;
  fetchImpl: typeof fetch;
}): Promise<{ ok: true; posts: RedditPostData[] } | { ok: false; error: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const subredditPath = subreddits.join("+");
  const url = new URL(`https://oauth.reddit.com/r/${subredditPath}/search`);

  url.searchParams.set("q", query);
  url.searchParams.set("restrict_sr", "1");
  url.searchParams.set("sort", "new");
  url.searchParams.set("t", "week");
  url.searchParams.set("raw_json", "1");
  url.searchParams.set("limit", String(clampInteger(postsPerArtist, 5, 100)));

  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${accessToken}`,
        "user-agent": userAgent
      }
    });
    const text = await response.text();
    const parsed = tryParseJson(text) as RedditListingResponse | null;

    if (!response.ok) {
      return {
        ok: false,
        error: parsed?.message ? `Reddit search failed: ${parsed.message}.` : `Reddit search failed with ${response.status}.`
      };
    }

    return {
      ok: true,
      posts: (parsed?.data?.children ?? []).map((child) => child.data).filter((post): post is RedditPostData =>
        Boolean(post)
      )
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Reddit search failed."
    };
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeRedditPost(post: RedditPostData): RedditPost | null {
  const title = post.title?.trim().replace(/\s+/g, " ");

  if (!post.id || !title || post.removed_by_category || post.over_18) {
    return null;
  }

  const createdDate = parseUnixDate(post.created_utc);

  if (!createdDate) {
    return null;
  }

  const score = Math.max(0, getNumber(post.score) ?? getNumber(post.ups) ?? 0);
  const comments = Math.max(0, getNumber(post.num_comments) ?? 0);
  const subreddit = post.subreddit?.trim() || "unknown";
  const permalink = post.permalink?.startsWith("http")
    ? post.permalink
    : `https://www.reddit.com${post.permalink ?? ""}`;

  return {
    id: post.name ?? post.id,
    title: title.slice(0, 220),
    body: post.selftext?.trim().replace(/\s+/g, " ").slice(0, 900) ?? "",
    subreddit,
    permalink,
    createdDate,
    score,
    comments,
    upvoteRatio: getNumber(post.upvote_ratio),
    engagement: score + comments * 2,
    matchConfidence: 0,
    raw: post
  };
}

function buildRedditQuery(artist: MarketUpdateArtist, externalIds?: ArtistExternalIds) {
  const query = externalIds?.gdeltQuery?.trim() || buildDefaultGdeltQuery(artist.name);
  const phrases = extractQuotedSearchPhrases(query);
  const name = phrases[0] ?? artist.name;
  const cleanName = name.replace(/"/g, "").trim();

  if (cleanName.split(/\s+/).length === 1 && cleanName.length <= 6) {
    return `"${cleanName}" rapper OR "${cleanName}" music OR "${cleanName}" hip hop`;
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

function getArtistMentionConfidence(post: RedditPost, names: string[]) {
  const text = normalizeText(`${post.title} ${post.body}`);
  const compactText = text.replace(/\s+/g, "");
  const musicContext = hasMusicContext(text) || getSubredditTier(post.subreddit) >= 1;

  for (const name of names) {
    const normalizedName = normalizeText(name);

    if (!normalizedName) {
      continue;
    }

    const compactName = normalizedName.replace(/\s+/g, "");
    const isShortName = compactName.length <= 3;
    const exactPattern = new RegExp(`(^|\\s)${escapeRegExp(normalizedName)}($|\\s)`);

    if (exactPattern.test(text)) {
      return isShortName && !musicContext ? 0 : isShortName ? 0.72 : 0.94;
    }

    if (!isShortName && compactName.length > 4 && compactText.includes(compactName)) {
      return 0.82;
    }

    const meaningfulParts = normalizedName.split(" ").filter((part) => part.length > 2);

    if (meaningfulParts.length > 1 && meaningfulParts.every((part) => text.includes(part))) {
      return 0.76;
    }
  }

  return 0;
}

function hasMusicContext(text: string) {
  return hasAny(text, MUSIC_CONTEXT_TERMS);
}

function normalizeSubreddits(values: string[]) {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim().replace(/^r\//i, "").replace(/[^a-zA-Z0-9_]+/g, ""))
        .filter(Boolean)
    )
  );
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

function isWithinLookback(date: string, runDate: string, lookbackDays: number) {
  const daysOld = daysBetween(date, runDate);

  return daysOld >= 0 && daysOld <= lookbackDays;
}

function daysBetween(start: string, end: string) {
  const startDate = new Date(`${start}T00:00:00.000Z`).getTime();
  const endDate = new Date(`${end}T00:00:00.000Z`).getTime();

  return Math.round((endDate - startDate) / 86400000);
}

function parseUnixDate(value: number | undefined) {
  if (!value || !Number.isFinite(value)) {
    return null;
  }

  return new Date(value * 1000).toISOString().slice(0, 10);
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

function countMatches(value: string, terms: string[]) {
  return terms.reduce((count, term) => count + (value.includes(term) ? 1 : 0), 0);
}

function hasAny(value: string, terms: string[]) {
  return terms.some((term) => value.includes(term));
}

function getSubredditTier(subreddit: string) {
  const normalized = subreddit.toLowerCase();

  if (TIER_TWO_SUBREDDITS.has(normalized)) {
    return 2;
  }

  if (TIER_ONE_SUBREDDITS.has(normalized)) {
    return 1;
  }

  return 0;
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

const TIER_TWO_SUBREDDITS = new Set(["hiphopheads", "popheads"]);
const TIER_ONE_SUBREDDITS = new Set(["rap", "undergroundhiphop", "playboicarti"]);

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
  "mixtape",
  "music",
  "performance",
  "rapper",
  "release",
  "rolling loud",
  "song",
  "snippet",
  "track",
  "video"
];

const RELEASE_TERMS = [
  "album",
  "announced",
  "announces",
  "deluxe",
  "drops",
  "dropped",
  "ep",
  "mixtape",
  "music video",
  "new project",
  "new song",
  "new single",
  "out now",
  "release",
  "released",
  "releases",
  "single",
  "tracklist",
  "video"
];

const SNIPPET_TERMS = [
  "leak",
  "leaked",
  "preview",
  "snippet",
  "snippets",
  "teaser",
  "unreleased"
];

const PERFORMANCE_TERMS = [
  "crowd went crazy",
  "festival",
  "live",
  "performance",
  "performed",
  "rolling loud",
  "set was",
  "stage"
];

const FEATURE_TERMS = [
  "co sign",
  "cosign",
  "collab",
  "collaboration",
  "feat",
  "feature",
  "featured",
  "featuring",
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
  "going viral",
  "goes viral",
  "meme",
  "tiktok",
  "trend",
  "trending",
  "viral"
];

const CONTROVERSY_TERMS = [
  "arrested",
  "backlash",
  "beef",
  "charged",
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
  "fall off",
  "fallen off",
  "fell off",
  "flop",
  "flopped",
  "low sales",
  "washed"
];

const POSITIVE_TERMS = [
  "amazing",
  "blew up",
  "classic",
  "crazy",
  "fire",
  "goes hard",
  "hard",
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
  "fell off",
  "flop",
  "flopped",
  "mid",
  "overrated",
  "trash",
  "weak",
  "washed"
];
