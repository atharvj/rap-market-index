import { clamp } from "@/lib/pricing";
import type { MarketUpdateArtist } from "@/server/market/daily-update";
import {
  buildWikipediaSearchQuery,
  buildWikipediaTitleCandidates,
  getVerifiedWikipediaTitle,
  getArtistTextKey
} from "@/server/market/artist-text-identifiers";
import type {
  AdapterSignal,
  AdapterSignals,
  ArtistExternalIds,
  MarketObservation,
  ObservationBaselines
} from "@/server/market/market-data";
import type { HypeStats } from "@/lib/types";

type WikimediaCollectOptions = {
  artists: MarketUpdateArtist[];
  externalIds?: Record<string, ArtistExternalIds>;
  runDate: string;
  baselines?: ObservationBaselines;
  previousArticles?: Record<string, Record<string, unknown>>;
  delayMs?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

type WikipediaSearchResponse = {
  query?: {
    search?: Array<{
      title?: string;
      snippet?: string;
      pageid?: number;
      wordcount?: number;
    }>;
  };
  error?: {
    info?: string;
  };
};

type WikipediaPageQueryResponse = {
  query?: {
    pages?: Record<
      string,
      {
        pageid?: number;
        title?: string;
        missing?: string;
        extract?: string;
        pageprops?: { disambiguation?: string };
      }
    >;
  };
  error?: {
    info?: string;
  };
};

type WikimediaPageviewsResponse = {
  items?: Array<{
    article?: string;
    timestamp?: string;
    views?: number;
  }>;
};

type WikipediaCandidate = {
  title: string;
  confidence: number;
  reason: string;
  snippet?: string;
  pageId?: number;
};

export type WikimediaMarketSignals = {
  signals: AdapterSignals;
  observations: MarketObservation[];
  warnings: string[];
};

const SOURCE = "wikimedia";
const PAGEVIEWS_7D = "pageviews_7d";
const PAGEVIEWS_1D = "pageviews_1d";
const ARTICLE_MATCH_CONFIDENCE = "article_match_confidence";
const REQUEST_ERROR = "request_error";

export async function collectWikimediaMarketSignals({
  artists,
  externalIds = {},
  runDate,
  baselines = {},
  previousArticles = {},
  delayMs = 250,
  timeoutMs = 10000,
  fetchImpl = fetch
}: WikimediaCollectOptions): Promise<WikimediaMarketSignals> {
  const signals: AdapterSignals = {};
  const observations: MarketObservation[] = [];
  const warnings: string[] = [];
  let sourceRateLimited = false;

  for (const [index, artist] of artists.entries()) {
    if (sourceRateLimited) {
      signals[artist.id] = { stats: {}, rawPayload: {
        source: SOURCE, runDate, status: "rate_limited", error: "Remaining requests paused after provider rate limiting."
      } };
      continue;
    }
    if (index > 0 && delayMs > 0) {
      await sleep(delayMs);
    }

    const query = buildWikipediaSearchQuery(artist.name);
    const previous = previousArticles[artist.id];
    const cachedTitle = typeof previous?.title === "string" &&
      typeof previous.matchConfidence === "number" && previous.matchConfidence >= 0.55
      ? previous.title : undefined;
    const verifiedTitle = externalIds[artist.id]?.wikipediaArticleTitle?.trim() || getVerifiedWikipediaTitle(artist.name);
    const exactTitle = verifiedTitle || cachedTitle;
    const article = await resolveWikipediaArticle({
      artist,
      query,
      exactTitle,
      exactConfidence: verifiedTitle ? 0.95 : previous?.matchConfidence as number | undefined,
      timeoutMs,
      fetchImpl
    });

    if (!article.ok) {
      if (article.error.includes("429") && !sourceRateLimited) {
        sourceRateLimited = true;
        warnings.push("Wikimedia requests paused after rate limiting; existing observations are preserved.");
      }
      signals[artist.id] = {
        stats: {},
        rawPayload: {
          source: SOURCE,
          query,
          status: "no_article",
          error: article.error
        }
      };
      observations.push(
        createObservation(artist.id, runDate, ARTICLE_MATCH_CONFIDENCE, 0, "score", {
          source: SOURCE,
          query,
          status: "no_article",
          error: article.error
        })
      );
      continue;
    }

    const pageviews = await fetchArticlePageviews({
      title: article.candidate.title,
      runDate,
      timeoutMs,
      fetchImpl
    });

    if (!pageviews.ok) {
      if (pageviews.error.includes("429") || pageviews.error.includes("503")) {
        sourceRateLimited = true;
        warnings.push("Wikimedia requests paused after rate limiting; existing observations are preserved.");
      }
      signals[artist.id] = {
        stats: {},
        rawPayload: {
          source: SOURCE,
          query,
          title: article.candidate.title,
          status: "error",
          error: pageviews.error
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
          title: article.candidate.title,
          error: pageviews.error
        }
      });
      continue;
    }

    const signal = buildWikimediaSignal({
      artist,
      runDate,
      query,
      candidate: article.candidate,
      pageviews: pageviews.items,
      baseline: baselines[artist.id] ?? {}
    });

    signals[artist.id] = signal.signal;
    observations.push(...signal.observations);
  }

  return {
    signals,
    observations,
    warnings
  };
}

function buildWikimediaSignal({
  artist,
  runDate,
  query,
  candidate,
  pageviews,
  baseline
}: {
  artist: MarketUpdateArtist;
  runDate: string;
  query: string;
  candidate: WikipediaCandidate;
  pageviews: WikimediaPageviewsResponse["items"];
  baseline: Record<string, number>;
}): {
  signal: AdapterSignal;
  observations: MarketObservation[];
} {
  const cleanPageviews = pageviews ?? [];
  const pageviews7d = cleanPageviews.slice(-7).reduce((total, item) => total + getNumber(item.views), 0);
  const pageviews1d = cleanPageviews.at(-1)?.views ?? 0;
  const previousWeekViews = cleanPageviews.slice(0, 7).reduce((total, item) => total + getNumber(item.views), 0);
  const previousDailyMean = cleanPageviews.slice(-8, -1).reduce((total, item) => total + getNumber(item.views), 0) / 7;
  // Compare complete provider days, including on the first collection. Daily
  // attention can rise or fall independently of the slower weekly trend.
  const dailyMomentum = calculatePageviewMomentum(pageviews1d, previousDailyMean, 20);
  const weeklyMomentum = calculatePageviewMomentum(pageviews7d, previousWeekViews, 140);
  const pageviewMomentum = dailyMomentum * 0.6 + weeklyMomentum * 0.4;
  const stats: Partial<HypeStats> = {};

  if (typeof pageviewMomentum === "number") {
    // Encyclopedia lookups measure discovery/attention, not fan approval or
    // media coverage. Keep the observation in its one defensible channel.
    stats.searchGrowth = clamp(pageviewMomentum * 0.72, -30, 95);
  }

  const rawPayload = {
    source: SOURCE,
    runDate,
    query,
    title: candidate.title,
    pageId: candidate.pageId ?? null,
    matchConfidence: candidate.confidence,
    matchReason: candidate.reason,
    pageviews7d,
    pageviews1d,
    previousWeekViews,
    previousDailyMean,
    dailyMomentum,
    weeklyMomentum,
    baselinePageviews7d: baseline[PAGEVIEWS_7D] ?? null,
    pageviewMomentum,
    status: Object.keys(stats).length ? "ok" : "baseline_only"
  };

  return {
    signal: {
      stats,
      confidence: clamp(0.42 + candidate.confidence * 0.42, 0.42, 0.82),
      rawPayload
    },
    observations: [
      createObservation(artist.id, runDate, PAGEVIEWS_7D, pageviews7d, "views", rawPayload),
      createObservation(artist.id, runDate, PAGEVIEWS_1D, pageviews1d, "views", rawPayload),
      createObservation(artist.id, runDate, ARTICLE_MATCH_CONFIDENCE, candidate.confidence, "score", rawPayload)
    ]
  };
}

async function resolveWikipediaArticle({
  artist,
  query,
  exactTitle,
  exactConfidence = 0.95,
  timeoutMs,
  fetchImpl
}: {
  artist: MarketUpdateArtist;
  query: string;
  exactTitle?: string;
  exactConfidence?: number;
  timeoutMs: number;
  fetchImpl: typeof fetch;
}): Promise<{ ok: true; candidate: WikipediaCandidate } | { ok: false; error: string }> {
  if (exactTitle) {
    // These identities have already been verified. Repeating article discovery
    // for every artist every day exhausts the search API's rate limit.
    return { ok: true, candidate: {
      title: exactTitle, confidence: clamp(exactConfidence, 0.55, 0.95), reason: "Previously verified Wikipedia article."
    } };
  }
  const titleCandidate = await resolveWikipediaTitleCandidate({
    artist,
    titleCandidates: exactTitle ? [exactTitle] : undefined,
    minimumScore: exactTitle ? 0 : undefined,
    manualOverride: Boolean(exactTitle),
    timeoutMs,
    fetchImpl
  });

  if (titleCandidate.ok) {
    return titleCandidate;
  }

  if (exactTitle || titleCandidate.error.includes("429")) {
    return titleCandidate;
  }

  const url = new URL("https://en.wikipedia.org/w/api.php");

  url.searchParams.set("action", "query");
  url.searchParams.set("list", "search");
  url.searchParams.set("srsearch", query);
  url.searchParams.set("srlimit", "6");
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");

  const result = await fetchJson({
    url: url.toString(),
    timeoutMs,
    fetchImpl,
    headers: {
      "user-agent": "RapMarketIndex/1.0 (https://rap-market-index.vercel.app)"
    }
  });

  if (!result.ok) {
    return result;
  }

  const parsed = result.value as WikipediaSearchResponse;

  if (parsed.error?.info) {
    return {
      ok: false,
      error: parsed.error.info
    };
  }

  const candidates = (parsed.query?.search ?? [])
    .filter((item) => item.title)
    .map((item): WikipediaCandidate => {
      const score = scoreWikipediaCandidate({
        artistName: artist.name,
        title: item.title ?? "",
        snippet: item.snippet ?? ""
      });

      return {
        title: item.title ?? "",
        confidence: score.confidence,
        reason: score.reason,
        snippet: item.snippet,
        pageId: item.pageid
      };
    })
    .sort((first, second) => second.confidence - first.confidence);
  const best = candidates[0];

  if (!best || best.confidence < 0.55) {
    return {
      ok: false,
      error: "No high-confidence Wikipedia article match was found."
    };
  }

  return {
    ok: true,
    candidate: best
  };
}

async function resolveWikipediaTitleCandidate({
  artist,
  titleCandidates = buildWikipediaTitleCandidates(artist.name),
  minimumScore = 0.55,
  manualOverride = false,
  timeoutMs,
  fetchImpl
}: {
  artist: MarketUpdateArtist;
  titleCandidates?: string[];
  minimumScore?: number;
  manualOverride?: boolean;
  timeoutMs: number;
  fetchImpl: typeof fetch;
}): Promise<{ ok: true; candidate: WikipediaCandidate } | { ok: false; error: string }> {
  const errors: string[] = [];

  for (const title of titleCandidates) {
    const url = new URL("https://en.wikipedia.org/w/api.php");

    url.searchParams.set("action", "query");
    url.searchParams.set("titles", title);
    url.searchParams.set("redirects", "1");
    url.searchParams.set("prop", "extracts|pageprops");
    url.searchParams.set("exintro", "1");
    url.searchParams.set("explaintext", "1");
    url.searchParams.set("format", "json");
    url.searchParams.set("origin", "*");

    const result = await fetchJson({
      url: url.toString(),
      timeoutMs,
      fetchImpl,
      headers: {
        "user-agent": "RapMarketIndex/1.0 (https://rap-market-index.vercel.app)"
      }
    });

    if (!result.ok) {
      if (result.error.includes("429")) return result;
      errors.push(result.error);
      continue;
    }

    const parsed = result.value as WikipediaPageQueryResponse;

    if (parsed.error?.info) {
      errors.push(parsed.error.info);
      continue;
    }

    const page = Object.values(parsed.query?.pages ?? {}).find((candidate) =>
      candidate && !("missing" in candidate) && !("disambiguation" in (candidate.pageprops ?? {}))
    );

    if (!page?.title) {
      errors.push(`No Wikipedia page found for ${title}.`);
      continue;
    }

    const score = scoreWikipediaCandidate({
      artistName: artist.name,
      title: page.title,
      snippet: page.extract ?? ""
    });

    if (score.confidence < minimumScore) {
      errors.push(`${page.title} did not have enough artist context.`);
      continue;
    }

    return {
      ok: true,
      candidate: {
        title: page.title,
        confidence: score.confidence,
        reason: manualOverride ? "Operator-verified exact Wikipedia title." : `Exact title lookup: ${score.reason}`,
        snippet: page.extract,
        pageId: page.pageid
      }
    };
  }

  return {
    ok: false,
    error: errors[0] ?? "No exact-title Wikipedia article match was found."
  };
}

async function fetchArticlePageviews({
  title,
  runDate,
  timeoutMs,
  fetchImpl
}: {
  title: string;
  runDate: string;
  timeoutMs: number;
  fetchImpl: typeof fetch;
}): Promise<{ ok: true; items: NonNullable<WikimediaPageviewsResponse["items"]> } | { ok: false; error: string }> {
  const endDate = shiftDate(runDate, -1);
  const startDate = shiftDate(runDate, -14);
  const article = encodeURIComponent(title.replace(/ /g, "_"));
  const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${article}/daily/${toWikimediaDate(startDate)}/${toWikimediaDate(endDate)}`;
  const result = await fetchJson({
    url,
    timeoutMs,
    fetchImpl,
    headers: {
      "user-agent": "RapMarketIndex/1.0 (https://rap-market-index.vercel.app)"
    }
  });

  if (!result.ok) {
    return result;
  }

  const parsed = result.value as WikimediaPageviewsResponse;
  const items = Array.isArray(parsed.items)
    ? [...parsed.items].sort((a, b) => (a.timestamp ?? "").localeCompare(b.timestamp ?? "")) : [];
  const complete = items.length === 14 && items.every((item, index) =>
    item.timestamp === toWikimediaDate(shiftDate(startDate, index)) &&
    typeof item.views === "number" && Number.isFinite(item.views) && item.views >= 0
  );

  if (!complete) {
    return { ok: false, error: "Wikimedia did not return 14 complete, consecutive daily observations." };
  }

  return {
    ok: true,
    items
  };
}

async function fetchJson({
  url,
  timeoutMs,
  fetchImpl,
  headers,
  retry = true
}: {
  url: string;
  timeoutMs: number;
  fetchImpl: typeof fetch;
  headers?: Record<string, string>;
  retry?: boolean;
}): Promise<{ ok: true; value: unknown } | { ok: false; error: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers
    });
    const text = await response.text();
    if ((response.status === 429 || response.status === 503) && retry) {
      const header = response.headers.get("retry-after");
      const seconds = header && /^\d+$/.test(header) ? Number(header) : undefined;
      const retryAt = header && seconds === undefined ? Date.parse(header) : NaN;
      const delay = seconds !== undefined ? seconds * 1000 : Number.isFinite(retryAt) ? Math.max(0, retryAt - Date.now()) : 5000;
      // Bound server execution; long outages remain unavailable, never zero.
      if (delay <= 30_000) {
        clearTimeout(timeout);
        await sleep(delay);
        return fetchJson({ url, timeoutMs, fetchImpl, headers, retry: false });
      }
    }

    if (!response.ok) {
      return {
        ok: false,
        error: `Wikimedia request failed with ${response.status}: ${text.slice(0, 180)}`
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
        error: text.slice(0, 220) || "Wikimedia returned a non-JSON response."
      };
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Wikimedia request failed."
    };
  } finally {
    clearTimeout(timeout);
  }
}

function scoreWikipediaCandidate({
  artistName,
  title,
  snippet
}: {
  artistName: string;
  title: string;
  snippet: string;
}) {
  const expected = normalizeSearchText(artistName);
  const titleBase = normalizeSearchText(title.replace(/\([^)]*\)/g, " "));
  const titleText = normalizeSearchText(title);
  const snippetText = normalizeSearchText(stripHtml(snippet));
  const text = `${titleText} ${snippetText}`;
  const expectedTokens = expected.split(" ").filter(Boolean);
  const titleTokens = new Set(titleBase.split(" ").filter(Boolean));
  const overlap = expectedTokens.filter((token) => titleTokens.has(token)).length;
  const musicScore = getTermScore(text, MUSIC_TERMS, 0.24);
  const penalty = getTermScore(text, NEGATIVE_TERMS, 0.34);
  const key = getArtistTextKey(artistName);
  let score = 0;
  let reason = "Ranked by title overlap and music context.";

  if (titleBase === expected) {
    score = 0.58;
    reason = "Exact article-title match with music context.";
  } else if (titleText.includes(expected)) {
    score = 0.48;
    reason = "Article title contains the artist name.";
  } else if (expectedTokens.length > 0) {
    score = overlap / expectedTokens.length * 0.42;
  }

  if (text.includes(`${expected} rapper`) || text.includes(`rapper ${expected}`) || titleText.includes("rapper")) {
    score += 0.14;
  }

  score += musicScore;
  score -= penalty;

  if (COMMON_AMBIGUOUS_KEYS.has(key) && !hasAny(text, RAP_TERMS)) {
    score = Math.min(score, 0.49);
    reason = "Ambiguous artist name without enough rap context.";
  }

  if (titleText.includes("disambiguation") || titleText.endsWith(" discography") ||
    /\b(?:may refer to|given name|name list|surname)\b/.test(snippetText)) {
    score = Math.min(score, 0.45);
  }

  return {
    confidence: clamp(score, 0, 0.95),
    reason
  };
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

function calculatePageviewMomentum(current: number, baseline: number, minimumBaseline: number) {
  return clamp(((current - baseline) / Math.max(minimumBaseline, baseline)) * 100 * 1.6, -40, 120);
}

function getTermScore(value: string, terms: string[], max: number) {
  const matches = terms.filter((term) => value.includes(term)).length;

  return clamp(matches * 0.055, 0, max);
}

function hasAny(value: string, terms: string[]) {
  return terms.some((term) => value.includes(term));
}

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, " ");
}

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function toWikimediaDate(date: string) {
  return `${date.replaceAll("-", "")}00`;
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

const RAP_TERMS = ["rapper", "rap", "hip hop", "trap"];

const MUSIC_TERMS = [
  "rapper",
  "rap",
  "hip hop",
  "trap",
  "musician",
  "singer",
  "songwriter",
  "record producer",
  "album",
  "mixtape",
  "single"
];

const NEGATIVE_TERMS = [
  "actor",
  "basketball",
  "football",
  "politician",
  "cricketer",
  "baseball",
  "company",
  "film",
  "television series",
  "video game"
];

const COMMON_AMBIGUOUS_KEYS = new Set(["autumn", "che", "feng", "future", "ian", "tana", "ye"]);
