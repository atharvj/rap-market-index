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

type GdeltArticle = {
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
  }

  return {
    signals,
    observations
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
  return externalIds?.gdeltQuery?.trim() || `"${artist.name}" rapper OR "${artist.name}" music`;
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
