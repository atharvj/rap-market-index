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

export type GdeltArticle = {
  title?: string;
  url?: string;
  domain?: string;
  seendate?: string;
  language?: string;
  sourcecountry?: string;
  tone?: number | string;
};

type GdeltResponse = {
  articles?: GdeltArticle[];
};

type GdeltCollectOptions = {
  artists: MarketUpdateArtist[];
  runDate: string;
  externalIds?: Record<string, ArtistExternalIds>;
  baselines?: ObservationBaselines;
  delayMs?: number;
  maxRecords?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

export type GdeltMarketSignals = {
  signals: AdapterSignals;
  observations: MarketObservation[];
  eventsByArtist: Record<string, MarketEvent[]>;
};

const SOURCE = "gdelt";
const ARTICLE_COUNT = "article_count";
const AVERAGE_TONE = "average_tone";
const SOURCE_COUNT = "source_count";
const REQUEST_ERROR = "request_error";

export async function collectGdeltMarketSignals({
  artists,
  runDate,
  externalIds = {},
  baselines = {},
  delayMs = 5200,
  maxRecords = 25,
  timeoutMs = 12000,
  fetchImpl = fetch
}: GdeltCollectOptions): Promise<GdeltMarketSignals> {
  const signals: AdapterSignals = {};
  const observations: MarketObservation[] = [];
  const eventsByArtist: Record<string, MarketEvent[]> = {};

  for (const [index, artist] of artists.entries()) {
    if (index > 0 && delayMs > 0) {
      await sleep(delayMs);
    }

    const query = getGdeltQuery(artist, externalIds[artist.id]);
    const result = await fetchGdeltArticles({
      query,
      runDate,
      maxRecords,
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
      observations.push({
        artistId: artist.id,
        source: SOURCE,
        metric: REQUEST_ERROR,
        observedDate: runDate,
        value: 1,
        unit: "flag",
        rawPayload: {
          query,
          error: result.error
        }
      });
      continue;
    }

    const signal = buildGdeltSignal({
      artist,
      articles: result.articles,
      query,
      runDate,
      baseline: baselines[artist.id] ?? {}
    });

    signals[artist.id] = signal.signal;
    observations.push(...signal.observations);

    const events = buildGdeltArticleEvents({
      artist,
      articles: result.articles,
      runDate,
      query
    });

    if (events.length) {
      eventsByArtist[artist.id] = events;
    }
  }

  return {
    signals,
    observations,
    eventsByArtist
  };
}

function buildGdeltSignal({
  artist,
  articles,
  query,
  runDate,
  baseline
}: {
  artist: MarketUpdateArtist;
  articles: GdeltArticle[];
  query: string;
  runDate: string;
  baseline: Record<string, number>;
}): {
  signal: AdapterSignal;
  observations: MarketObservation[];
} {
  const articleCount = articles.length;
  const domains = new Set(articles.map((article) => article.domain).filter(Boolean));
  const tones = articles
    .map((article) => getNumber(article.tone))
    .filter((value): value is number => typeof value === "number");
  const averageTone = tones.reduce((total, value) => total + value, 0) / Math.max(1, tones.length);
  const sourceCount = domains.size;
  const coverageMomentum = calculateCoverageMomentum(articleCount, baseline[ARTICLE_COUNT]);
  const stats: Partial<HypeStats> = {};

  if (typeof coverageMomentum === "number") {
    const sourceDiversity = clamp(sourceCount * 2, 0, 16);
    const toneContribution = clamp(averageTone * 4, -18, 18);

    stats.searchGrowth = clamp(coverageMomentum * 0.5 + sourceDiversity, -30, 95);
    stats.socialGrowth = clamp(coverageMomentum * 0.25 + Math.min(articleCount, 20) * 0.7, -35, 120);
    stats.newsScore = clamp(50 + coverageMomentum * 0.16 + toneContribution + sourceDiversity * 0.5, 0, 100);
  }

  const rawPayload = {
    source: SOURCE,
    query,
    runDate,
    articleCount,
    sourceCount,
    averageTone,
    baselineArticleCount: baseline[ARTICLE_COUNT] ?? null,
    coverageMomentum,
    status: Object.keys(stats).length ? "ok" : "baseline_only",
    topArticles: articles.slice(0, 5).map((article) => ({
      title: article.title ?? "",
      domain: article.domain ?? "",
      url: article.url ?? "",
      seenDate: article.seendate ?? "",
      tone: getNumber(article.tone) ?? null
    }))
  };

  return {
    signal: {
      stats,
      confidence: 0.58,
      rawPayload
    },
    observations: [
      createObservation(artist.id, runDate, ARTICLE_COUNT, articleCount, "articles", rawPayload),
      createObservation(artist.id, runDate, AVERAGE_TONE, averageTone, "tone", rawPayload),
      createObservation(artist.id, runDate, SOURCE_COUNT, sourceCount, "domains", rawPayload)
    ]
  };
}

async function fetchGdeltArticles({
  query,
  runDate,
  maxRecords,
  timeoutMs,
  fetchImpl
}: {
  query: string;
  runDate: string;
  maxRecords: number;
  timeoutMs: number;
  fetchImpl: typeof fetch;
}): Promise<{ ok: true; articles: GdeltArticle[] } | { ok: false; error: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const url = new URL("https://api.gdeltproject.org/api/v2/doc/doc");

  url.searchParams.set("query", query);
  url.searchParams.set("mode", "ArtList");
  url.searchParams.set("format", "json");
  url.searchParams.set("maxrecords", String(maxRecords));
  url.searchParams.set("sort", "HybridRel");
  url.searchParams.set("startdatetime", toGdeltDateTime(shiftDate(runDate, -6), "start"));
  url.searchParams.set("enddatetime", toGdeltDateTime(runDate, "end"));

  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "rap-market-index/0.1 market research"
      }
    });
    const text = await response.text();

    if (!response.ok) {
      return {
        ok: false,
        error: `GDELT request failed with ${response.status}.`
      };
    }

    try {
      const parsed = JSON.parse(text) as GdeltResponse;

      return {
        ok: true,
        articles: Array.isArray(parsed.articles) ? parsed.articles : []
      };
    } catch {
      return {
        ok: false,
        error: text.slice(0, 220) || "GDELT returned a non-JSON response."
      };
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "GDELT request failed."
    };
  } finally {
    clearTimeout(timeout);
  }
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

function getGdeltQuery(artist: MarketUpdateArtist, externalIds?: ArtistExternalIds) {
  return externalIds?.gdeltQuery?.trim() || buildDefaultGdeltQuery(artist.name);
}

function buildGdeltArticleEvents({
  artist,
  articles,
  runDate,
  query
}: {
  artist: MarketUpdateArtist;
  articles: GdeltArticle[];
  runDate: string;
  query: string;
}) {
  const events: MarketEvent[] = [];
  const seen = new Set<string>();

  for (const article of articles) {
    const title = normalizeArticleTitle(article.title);
    const url = article.url?.trim();
    const domain = normalizeDomain(article.domain, url);
    const eventDate = parseGdeltSeenDate(article.seendate) ?? runDate;

    if (!title || !url || !domain || !mentionsArtist(title, artist.name)) {
      continue;
    }

    const classification = classifyArticleEvent(title, domain, article.tone);

    if (!classification) {
      continue;
    }

    const key = `${classification.eventType}:${eventDate}:${normalizeEventKey(title)}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    events.push({
      artistId: artist.id,
      eventDate,
      eventType: classification.eventType,
      title,
      sourceName: domain,
      sourceUrl: url,
      sentimentScore: classification.sentimentScore,
      impactScore: classification.impactScore,
      confidence: classification.confidence,
      rawPayload: {
        source: "gdelt_article",
        query,
        domain,
        seenDate: article.seendate ?? null,
        tone: getNumber(article.tone),
        classificationReason: classification.reason,
        sourceTier: getSourceTier(domain)
      }
    });

    if (events.length >= 3) {
      break;
    }
  }

  return events;
}

function classifyArticleEvent(title: string, domain: string, tone: unknown) {
  const lowerTitle = title.toLowerCase();
  const sourceTier = getSourceTier(domain);
  const toneScore = clamp((getNumber(tone) ?? 0) * 8, -45, 45);

  if (hasAny(lowerTitle, CONTROVERSY_TERMS)) {
    return {
      eventType: "controversy" as const,
      sentimentScore: clamp(Math.min(-35, toneScore - 25), -100, 20),
      impactScore: clamp(Math.min(-45, toneScore - 35), -100, 10),
      confidence: getArticleConfidence(sourceTier, 0.76),
      reason: "controversy_terms"
    };
  }

  if (hasReviewSignal(lowerTitle)) {
    const keywordSentiment = getTitleSentiment(lowerTitle);
    const sentimentScore = clamp(keywordSentiment + toneScore * 0.75, -90, 90);

    return {
      eventType: "review" as const,
      sentimentScore,
      impactScore: clamp(sentimentScore * 0.95, -90, 90),
      confidence: getArticleConfidence(sourceTier, REVIEW_DOMAINS.has(domain) ? 0.82 : 0.68),
      reason: REVIEW_DOMAINS.has(domain) ? "review_domain" : "review_keyword"
    };
  }

  if (hasAny(lowerTitle, TOUR_TERMS)) {
    return {
      eventType: "tour" as const,
      sentimentScore: clamp(25 + Math.max(0, toneScore), -20, 70),
      impactScore: clamp(30 + Math.max(0, toneScore), -20, 75),
      confidence: getArticleConfidence(sourceTier, 0.68),
      reason: "tour_terms"
    };
  }

  if (hasAny(lowerTitle, AWARD_TERMS)) {
    return {
      eventType: "award" as const,
      sentimentScore: clamp(35 + Math.max(0, toneScore), -20, 85),
      impactScore: clamp(42 + Math.max(0, toneScore), -20, 90),
      confidence: getArticleConfidence(sourceTier, 0.7),
      reason: "award_terms"
    };
  }

  if (hasAny(lowerTitle, VIRAL_TERMS)) {
    return {
      eventType: "viral" as const,
      sentimentScore: clamp(24 + toneScore * 0.55, -45, 75),
      impactScore: clamp(38 + Math.max(0, toneScore), -20, 85),
      confidence: getArticleConfidence(sourceTier, 0.66),
      reason: "viral_terms"
    };
  }

  if (hasAny(lowerTitle, RELEASE_TERMS) && sourceTier >= 1) {
    return {
      eventType: "release" as const,
      sentimentScore: clamp(28 + toneScore * 0.4, -35, 75),
      impactScore: clamp(38 + Math.max(0, toneScore), -15, 85),
      confidence: getArticleConfidence(sourceTier, 0.62),
      reason: "release_terms"
    };
  }

  if (sourceTier >= 2 && Math.abs(toneScore) >= 18 && hasAny(lowerTitle, NEWS_TERMS)) {
    return {
      eventType: "news" as const,
      sentimentScore: clamp(toneScore, -65, 65),
      impactScore: clamp(toneScore * 0.9, -60, 60),
      confidence: getArticleConfidence(sourceTier, 0.58),
      reason: "tiered_news_tone"
    };
  }

  return null;
}

function hasReviewSignal(title: string) {
  return /\breview\b/.test(title) || /\brated\b/.test(title) || hasAny(title, REVIEW_PHRASES);
}

function getTitleSentiment(title: string) {
  const positive = countMatches(title, POSITIVE_REVIEW_TERMS);
  const negative = countMatches(title, NEGATIVE_REVIEW_TERMS);

  return clamp((positive - negative) * 22, -70, 70);
}

function countMatches(value: string, terms: string[]) {
  return terms.reduce((count, term) => count + (value.includes(term) ? 1 : 0), 0);
}

function getArticleConfidence(sourceTier: number, base: number) {
  return clamp(base + sourceTier * 0.055, 0.45, 0.9);
}

function getSourceTier(domain: string) {
  if (TIER_THREE_DOMAINS.has(domain)) {
    return 3;
  }

  if (TIER_TWO_DOMAINS.has(domain)) {
    return 2;
  }

  if (TIER_ONE_DOMAINS.has(domain)) {
    return 1;
  }

  return 0;
}

function hasAny(value: string, terms: string[]) {
  return terms.some((term) => value.includes(term));
}

function mentionsArtist(title: string, artistName: string) {
  const normalizedTitle = normalizeSearchText(title);
  const normalizedArtist = normalizeSearchText(artistName);

  if (normalizedTitle.includes(normalizedArtist)) {
    return true;
  }

  const meaningfulParts = normalizedArtist.split(" ").filter((part) => part.length > 2);

  return meaningfulParts.length > 1 && meaningfulParts.every((part) => normalizedTitle.includes(part));
}

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeArticleTitle(value: string | undefined) {
  const title = value?.trim().replace(/\s+/g, " ");

  return title ? title.slice(0, 160) : null;
}

function normalizeDomain(domain: string | undefined, url: string | undefined) {
  const fromDomain = domain?.trim().toLowerCase();

  if (fromDomain) {
    return fromDomain.replace(/^www\./, "");
  }

  if (!url) {
    return null;
  }

  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function normalizeEventKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function parseGdeltSeenDate(value: string | undefined) {
  if (!value) {
    return null;
  }

  const match = value.match(/^(\d{4})(\d{2})(\d{2})/);

  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function calculateCoverageMomentum(articleCount: number, baseline?: number) {
  if (typeof baseline === "number" && baseline > 0) {
    return clamp(((articleCount - baseline) / baseline) * 100, -40, 120);
  }

  return undefined;
}

function getNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function toGdeltDateTime(date: string, boundary: "start" | "end") {
  return `${date.replaceAll("-", "")}${boundary === "start" ? "000000" : "235959"}`;
}

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);

  return value.toISOString().slice(0, 10);
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

const REVIEW_DOMAINS = new Set([
  "allmusic.com",
  "complex.com",
  "consequence.net",
  "exclaim.ca",
  "hiphopdx.com",
  "musicomh.com",
  "nme.com",
  "pitchfork.com",
  "rapreviews.com",
  "rollingstone.com",
  "slantmagazine.com",
  "theguardian.com",
  "thelineofbestfit.com"
]);

const TIER_THREE_DOMAINS = new Set([
  "apnews.com",
  "billboard.com",
  "complex.com",
  "forbes.com",
  "latimes.com",
  "nytimes.com",
  "pitchfork.com",
  "reuters.com",
  "rollingstone.com",
  "variety.com",
  "washingtonpost.com"
]);

const TIER_TWO_DOMAINS = new Set([
  "allmusic.com",
  "consequence.net",
  "exclaim.ca",
  "hypebeast.com",
  "musicbusinessworldwide.com",
  "nme.com",
  "stereogum.com",
  "thefader.com",
  "theguardian.com",
  "uproxx.com",
  "vibe.com"
]);

const TIER_ONE_DOMAINS = new Set([
  "bet.com",
  "clashmusic.com",
  "genius.com",
  "hiphopdx.com",
  "hotnewhiphop.com",
  "music-news.com",
  "rap-up.com",
  "rapreviews.com",
  "thesource.com",
  "xxlmag.com"
]);

const CONTROVERSY_TERMS = [
  "arrest",
  "arrested",
  "charged",
  "controversy",
  "criticized",
  "lawsuit",
  "pleads guilty",
  "sentenced",
  "sued",
  "trial"
];

const REVIEW_TERMS = ["review", "rated"];
const REVIEW_PHRASES = ["album review", "best new music", "track review"];
const RELEASE_TERMS = ["album", "drops", "new song", "new single", "release", "releases", "shares", "video"];
const TOUR_TERMS = ["announces tour", "tour dates", "world tour"];
const AWARD_TERMS = ["award", "grammy", "nomination", "nominated", "wins"];
const VIRAL_TERMS = ["tiktok", "viral"];
const NEWS_TERMS = [...REVIEW_TERMS, ...RELEASE_TERMS, ...TOUR_TERMS, ...AWARD_TERMS, ...VIRAL_TERMS, ...CONTROVERSY_TERMS];

const POSITIVE_REVIEW_TERMS = [
  "acclaimed",
  "best",
  "brilliant",
  "classic",
  "excellent",
  "great",
  "powerful",
  "strong",
  "triumph"
];

const NEGATIVE_REVIEW_TERMS = [
  "bad",
  "disappointing",
  "fails",
  "flat",
  "mess",
  "negative",
  "poor",
  "weak",
  "worst"
];
