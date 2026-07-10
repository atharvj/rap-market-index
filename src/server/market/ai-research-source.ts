import { clamp } from "@/lib/pricing";
import type { MarketUpdateArtist } from "@/server/market/daily-update";
import { buildDefaultGdeltQuery } from "@/server/market/artist-text-identifiers";
import {
  classifyArticleEvent,
  getSourceTier,
  mentionsArtist,
  normalizeDomain
} from "@/server/market/gdelt-source";
import type {
  ArtistExternalIds,
  MarketEvent,
  MarketObservation
} from "@/server/market/market-data";

type AiResearchCollectOptions = {
  artists: MarketUpdateArtist[];
  runDate: string;
  provider?: "groq";
  apiKey?: string;
  model?: string;
  externalIds?: Record<string, ArtistExternalIds>;
  lookbackDays?: number;
  maxEventsPerArtist?: number;
  delayMs?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

type AiResearchResponseEvent = {
  title?: unknown;
  eventDate?: unknown;
  eventType?: unknown;
  sourceName?: unknown;
  sourceUrl?: unknown;
  summary?: unknown;
  whyItMatters?: unknown;
  sentimentScore?: unknown;
  impactScore?: unknown;
  confidence?: unknown;
  sourceType?: unknown;
  evidenceLevel?: unknown;
  reachScope?: unknown;
  supportingMediaUrl?: unknown;
  supportingMediaType?: unknown;
  relatedArtistNames?: unknown;
  corroboratingSourceCount?: unknown;
  publicReactionConfirmed?: unknown;
  factualClaimConfirmed?: unknown;
  riskFlags?: unknown;
};

type GroqChatResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
      executed_tools?: GroqExecutedTool[];
      citations?: unknown;
    };
  }>;
  error?: {
    message?: string;
  };
};

type GroqExecutedTool = {
  type?: string;
  name?: string;
  search_results?: GroqSearchResult[];
  results?: GroqSearchResult[];
};

type GroqSearchResult = {
  title?: string;
  url?: string;
  content?: string;
  published_date?: string;
  score?: number;
};

export type AiResearchMarketEvents = {
  observations: MarketObservation[];
  eventsByArtist: Record<string, MarketEvent[]>;
  warnings: string[];
};

const SOURCE = "ai_research";
const EVENT_COUNT = "event_count";
const HIGH_CONFIDENCE_EVENT_COUNT = "high_confidence_event_count";
const SOURCE_COUNT = "source_count";
const REQUEST_ERROR = "request_error";
const DEFAULT_MODEL = "groq/compound-mini";
const DEFAULT_LOOKBACK_DAYS = 14;
const DEFAULT_MAX_EVENTS_PER_ARTIST = 1;
const DEFAULT_DELAY_MS = 500;
const DEFAULT_TIMEOUT_MS = 25000;
const MAX_COMPLETION_TOKENS = 420;

const EVENT_TYPES = new Set<MarketEvent["eventType"]>([
  "release",
  "review",
  "news",
  "controversy",
  "award",
  "tour",
  "viral"
]);

const LOW_VALUE_DOMAINS = new Set([
  "bsky.app",
  "facebook.com",
  "instagram.com",
  "threads.net",
  "tiktok.com",
  "twitter.com",
  "x.com"
]);

const VIDEO_ONLY_DOMAINS = new Set(["youtube.com", "youtu.be", "music.youtube.com"]);

const LARGE_MODEL_HINTS = ["120b", "70b", "405b"];

export async function collectAiResearchMarketEvents({
  artists,
  runDate,
  provider = "groq",
  apiKey,
  model = DEFAULT_MODEL,
  externalIds = {},
  lookbackDays = DEFAULT_LOOKBACK_DAYS,
  maxEventsPerArtist = DEFAULT_MAX_EVENTS_PER_ARTIST,
  delayMs = DEFAULT_DELAY_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl = fetch
}: AiResearchCollectOptions): Promise<AiResearchMarketEvents> {
  const cleanApiKey = apiKey?.trim();

  if (!cleanApiKey) {
    return {
      observations: [],
      eventsByArtist: {},
      warnings: ["AI research is not configured; source-backed AI market discovery was skipped."]
    };
  }

  const observations: MarketObservation[] = [];
  const eventsByArtist: Record<string, MarketEvent[]> = {};
  const warnings: string[] = [];
  const resolvedModel = normalizeAiResearchModel(model);

  for (const [index, artist] of artists.entries()) {
    if (index > 0 && delayMs > 0) {
      await sleep(delayMs);
    }

    const query = buildResearchQuery(artist, externalIds[artist.id]);
    const result = await fetchAiResearchEvents({
      provider,
      apiKey: cleanApiKey,
      model: resolvedModel,
      artist,
      runDate,
      query,
      lookbackDays,
      maxEventsPerArtist,
      timeoutMs,
      fetchImpl
    });

    if (!result.ok) {
      warnings.push(`${artist.ticker}: AI research failed: ${result.error}`);
      observations.push(
        createObservation(artist.id, runDate, REQUEST_ERROR, 1, "flag", {
          source: SOURCE,
          provider,
          model: resolvedModel,
          query,
          error: result.error
        })
      );
      continue;
    }

    const normalizedEvents = result.events
      .map((event) =>
        normalizeAiResearchEvent({
          value: event,
          artist,
          runDate,
          query,
          provider,
          model: resolvedModel,
          lookbackDays,
          searchResults: result.searchResults,
          executedToolCount: result.executedToolCount
        })
      )
      .filter((event): event is MarketEvent => Boolean(event))
      .sort((first, second) => getEventRank(second) - getEventRank(first))
      .slice(0, maxEventsPerArtist);
    const uniqueEvents = dedupeEvents(normalizedEvents);

    observations.push(
      createObservation(artist.id, runDate, EVENT_COUNT, uniqueEvents.length, "events", {
        source: SOURCE,
        provider,
        model: resolvedModel,
        query,
        returnedCandidateCount: result.events.length,
        acceptedEventCount: uniqueEvents.length,
        executedToolCount: result.executedToolCount,
        searchResultCount: result.searchResults.length,
        topSearchResults: result.searchResults.slice(0, 6),
        topEvents: uniqueEvents.slice(0, 4).map((event) => ({
          title: event.title,
          eventType: event.eventType,
          eventDate: event.eventDate,
          sourceName: event.sourceName,
          sourceUrl: event.sourceUrl,
          impactScore: event.impactScore,
          confidence: event.confidence
        }))
      }),
      createObservation(
        artist.id,
        runDate,
        HIGH_CONFIDENCE_EVENT_COUNT,
        uniqueEvents.filter((event) => event.confidence >= 0.72).length,
        "events",
        {
          source: SOURCE,
          provider,
          model: resolvedModel,
          query
        }
      ),
      createObservation(
        artist.id,
        runDate,
        SOURCE_COUNT,
        new Set(uniqueEvents.map((event) => normalizeDomain(undefined, event.sourceUrl ?? undefined))).size,
        "sources",
        {
          source: SOURCE,
          provider,
          model: resolvedModel,
          query
        }
      )
    );

    if (uniqueEvents.length) {
      eventsByArtist[artist.id] = uniqueEvents;
    }
  }

  return {
    observations,
    eventsByArtist,
    warnings
  };
}

async function fetchAiResearchEvents({
  provider,
  apiKey,
  model,
  artist,
  runDate,
  query,
  lookbackDays,
  maxEventsPerArtist,
  timeoutMs,
  fetchImpl
}: {
  provider: "groq";
  apiKey: string;
  model: string;
  artist: MarketUpdateArtist;
  runDate: string;
  query: string;
  lookbackDays: number;
  maxEventsPerArtist: number;
  timeoutMs: number;
  fetchImpl: typeof fetch;
}): Promise<
  | { ok: true; events: AiResearchResponseEvent[]; searchResults: GroqSearchResult[]; executedToolCount: number }
  | { ok: false; error: string }
> {
  if (provider !== "groq") {
    return {
      ok: false,
      error: `Unsupported AI research provider: ${provider}.`
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_completion_tokens: MAX_COMPLETION_TOKENS,
        search_settings: {
          exclude_domains: ["azlyrics.com", "genius.com", "songmeanings.com"]
        },
        messages: [
          {
            role: "system",
            content:
              "Return JSON only. Find current source-backed rap market catalysts. Never invent facts or URLs. If no public source supports a meaningful event, return {\"events\":[]}. Reject low-view uploads, generic fan praise, private pages, sarcasm, jokes, memes, and old items."
          },
          {
            role: "user",
            content: buildResearchPrompt({
              artist,
              runDate,
              query,
              lookbackDays,
              maxEventsPerArtist
            })
          }
        ]
      })
    });
    const text = await response.text();

    if (!response.ok) {
      return {
        ok: false,
        error: text.slice(0, 240) || `AI research request failed with HTTP ${response.status}.`
      };
    }

    const parsed = JSON.parse(text) as GroqChatResponse;
    const message = parsed.choices?.[0]?.message;
    const content = message?.content;
    const executedTools = message?.executed_tools ?? [];
    const searchResults = normalizeGroqSearchResults(executedTools);

    if (parsed.error?.message) {
      return {
        ok: false,
        error: parsed.error.message
      };
    }

    if (!content) {
      return {
        ok: false,
        error: "AI research returned an empty message."
      };
    }

    const json = parseJsonObject(content);
    const events = Array.isArray(json.events) ? json.events : [];

    return {
      ok: true,
      events: events.filter((event): event is AiResearchResponseEvent => Boolean(event && typeof event === "object")),
      searchResults,
      executedToolCount: executedTools.length
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "AI research request failed."
    };
  } finally {
    clearTimeout(timeout);
  }
}

function buildResearchPrompt({
  artist,
  runDate,
  query,
  lookbackDays,
  maxEventsPerArtist
}: {
  artist: MarketUpdateArtist;
  runDate: string;
  query: string;
  lookbackDays: number;
  maxEventsPerArtist: number;
}) {
  return [
    `Artist: ${artist.name} (${artist.ticker}). Run date: ${runDate}. Window: ${lookbackDays} days.`,
    `Search context: ${query}. Return at most ${maxEventsPerArtist} source-backed events.`,
    "Use only catalysts that can move price: album/project/single/feature, review/reception, backlash/legal/health, viral performance/snippet, chart milestone, or clear decline.",
    "If many tracks dropped together, report the project, not one random track. Social/community items need factual confirmation and public reaction.",
    "JSON shape: {\"events\":[{\"title\":\"headline\",\"eventDate\":\"YYYY-MM-DD\",\"eventType\":\"release|review|news|controversy|award|tour|viral\",\"sourceName\":\"source\",\"sourceUrl\":\"https://...\",\"summary\":\"fact\",\"whyItMatters\":\"market reason\",\"sentimentScore\":0,\"impactScore\":0,\"confidence\":0.0,\"sourceType\":\"music_publication|mainstream_news|review|official|community|social|video\",\"evidenceLevel\":\"confirmed|reported|rumor|low_signal\",\"reachScope\":\"underground|scene|broad|mainstream\",\"supportingMediaUrl\":\"\",\"supportingMediaType\":\"none\",\"relatedArtistNames\":[],\"corroboratingSourceCount\":1,\"publicReactionConfirmed\":false,\"factualClaimConfirmed\":true,\"riskFlags\":[]}]}"
  ].join("\n");
}

function normalizeAiResearchEvent({
  value,
  artist,
  runDate,
  query,
  provider,
  model,
  lookbackDays,
  searchResults,
  executedToolCount
}: {
  value: AiResearchResponseEvent;
  artist: MarketUpdateArtist;
  runDate: string;
  query: string;
  provider: string;
  model: string;
  lookbackDays: number;
  searchResults: GroqSearchResult[];
  executedToolCount: number;
}): MarketEvent | null {
  const sourceUrl = getString(value.sourceUrl);
  const sourceName = getString(value.sourceName);
  const title = getString(value.title);
  const summary = getString(value.summary);
  const whyItMatters = getString(value.whyItMatters);
  const sourceType = normalizeLabel(getString(value.sourceType));
  const evidenceLevel = normalizeEvidenceLevel(getString(value.evidenceLevel));
  const reachScope = normalizeLabel(getString(value.reachScope));
  const supportingMediaUrl = getString(value.supportingMediaUrl);
  const supportingMedia = normalizeSupportingMedia({
    url: supportingMediaUrl,
    type: getString(value.supportingMediaType)
  });
  const eventDate = normalizeDate(getString(value.eventDate)) ?? runDate;
  const domain = normalizeDomain(undefined, sourceUrl ?? undefined);
  const sourceWasFoundBySearch = hasSourceUrlInSearchResults(sourceUrl, searchResults);
  const eventType = normalizeEventType(getString(value.eventType));
  const sourceTier = domain ? getSourceTier(domain) : 0;
  const classification = classifyArticleEvent(`${title ?? ""} ${summary ?? ""}`, domain ?? "", undefined, {
    allowLowTierRelease: true
  });
  const resolvedEventType = eventType ?? classification?.eventType ?? null;
  const sentimentScore = clamp(
    getNumber(value.sentimentScore, classification?.sentimentScore ?? 0),
    -100,
    100
  );
  const impactScore = clamp(
    getNumber(value.impactScore, classification?.impactScore ?? sentimentScore),
    -100,
    100
  );
  const confidence = clamp(getNumber(value.confidence, classification?.confidence ?? 0.55), 0, 1);
  const relatedArtistNames = Array.isArray(value.relatedArtistNames)
    ? value.relatedArtistNames.map((item) => getString(item)).filter((item): item is string => Boolean(item))
    : [];
  const riskFlags = Array.isArray(value.riskFlags)
    ? value.riskFlags.map((item) => getString(item)).filter((item): item is string => Boolean(item))
    : [];
  const corroboratingSourceCount = clamp(Math.round(getNumber(value.corroboratingSourceCount, 1)), 0, 12);
  const publicReactionConfirmed = getBoolean(value.publicReactionConfirmed);
  const factualClaimConfirmed = getBoolean(value.factualClaimConfirmed);

  if (!title || !sourceUrl || !domain || !isSafeHttpUrl(sourceUrl) || !resolvedEventType) {
    return null;
  }

  if (!isDateInsideWindow(eventDate, runDate, lookbackDays)) {
    return null;
  }

  if (!mentionsArtist(`${title} ${summary ?? ""} ${relatedArtistNames.join(" ")}`, artist.name, query)) {
    return null;
  }

  if (
    !isTrustworthyAiEvent({
      domain,
      sourceTier,
      sourceType,
      evidenceLevel,
      impactScore,
      confidence,
      sourceWasFoundBySearch,
      executedToolCount,
      riskFlags,
      corroboratingSourceCount,
      publicReactionConfirmed,
      factualClaimConfirmed
    })
  ) {
    return null;
  }

  const displayTitle = title.slice(0, 160);

  return {
    artistId: artist.id,
    eventDate,
    eventType: resolvedEventType,
    title: displayTitle,
    sourceName: sourceName?.slice(0, 80) ?? domain,
    sourceUrl,
    sentimentScore,
    impactScore,
    confidence,
    rawPayload: {
      source: "ai_research_event",
      provider,
      model,
      query,
      domain,
      sourceTier,
      sourceType,
      evidenceLevel,
      reachScope,
      summary,
      whyItMatters,
      relatedArtistNames,
      corroboratingSourceCount,
      publicReactionConfirmed,
      factualClaimConfirmed,
      riskFlags,
      executedToolCount,
      sourceWasFoundBySearch,
      searchResultCount: searchResults.length,
      supportingSearchResults: getSupportingSearchResults(sourceUrl, searchResults).slice(0, 4),
      supportingMediaUrl: supportingMedia?.url ?? null,
      supportingMediaType: supportingMedia?.type ?? null,
      classificationReason: classification?.reason ?? "ai_research_classification",
      releaseKind: classification?.releaseKind ?? null,
      statusSubtype: classification?.statusSubtype ?? null,
      statusSeverity: classification?.statusSeverity ?? null,
      statusHaltRecommended: classification?.statusHaltRecommended ?? false,
      aiValidated: true
    }
  };
}

function isTrustworthyAiEvent({
  domain,
  sourceTier,
  sourceType,
  evidenceLevel,
  impactScore,
  confidence,
  sourceWasFoundBySearch,
  executedToolCount,
  riskFlags,
  corroboratingSourceCount,
  publicReactionConfirmed,
  factualClaimConfirmed
}: {
  domain: string;
  sourceTier: number;
  sourceType: string;
  evidenceLevel: string;
  impactScore: number;
  confidence: number;
  sourceWasFoundBySearch: boolean;
  executedToolCount: number;
  riskFlags: string[];
  corroboratingSourceCount: number;
  publicReactionConfirmed: boolean;
  factualClaimConfirmed: boolean;
}) {
  if (executedToolCount <= 0 || !sourceWasFoundBySearch) {
    return false;
  }

  if (evidenceLevel === "low_signal" || evidenceLevel === "rumor") {
    return false;
  }

  if (hasHighRiskAiFlags(riskFlags)) {
    return false;
  }

  if (LOW_VALUE_DOMAINS.has(domain) && (confidence < 0.82 || Math.abs(impactScore) < 52)) {
    return false;
  }

  if (
    VIDEO_ONLY_DOMAINS.has(domain) &&
    (sourceType !== "official" || confidence < 0.8 || Math.abs(impactScore) < 58 || corroboratingSourceCount < 2)
  ) {
    return false;
  }

  if (sourceType === "social" || sourceType === "community") {
    if (confidence < 0.76) {
      return false;
    }

    if (!factualClaimConfirmed) {
      return false;
    }

    if (!publicReactionConfirmed && corroboratingSourceCount < 2) {
      return false;
    }
  }

  if (sourceTier === 0 && confidence < 0.68 && Math.abs(impactScore) < 42) {
    return false;
  }

  return Math.abs(impactScore) >= 18 && confidence >= 0.55;
}

function hasHighRiskAiFlags(riskFlags: string[]) {
  return riskFlags.some((flag) => {
    const normalized = flag.toLowerCase();

    return [
      "sarcasm",
      "joke",
      "meme",
      "fake",
      "hoax",
      "unverified",
      "private",
      "screenshot",
      "troll",
      "parody",
      "satire",
      "copypasta",
      "bot"
    ].some((term) => normalized.includes(term));
  });
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

function buildResearchQuery(artist: MarketUpdateArtist, externalIds?: ArtistExternalIds) {
  return externalIds?.gdeltQuery?.trim() || buildDefaultGdeltQuery(artist.name);
}

function normalizeAiResearchModel(value: string | undefined) {
  const candidate = value?.trim();

  if (!candidate) {
    return DEFAULT_MODEL;
  }

  const allowLargeModel = (process.env.MARKET_AI_RESEARCH_ALLOW_LARGE_MODEL ?? "").trim().toLowerCase();

  if (
    allowLargeModel !== "true" &&
    allowLargeModel !== "1" &&
    LARGE_MODEL_HINTS.some((hint) => candidate.toLowerCase().includes(hint))
  ) {
    return DEFAULT_MODEL;
  }

  return candidate;
}

function parseJsonObject(value: string) {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    const match = value.match(/\{[\s\S]*\}/);

    if (!match) {
      return {};
    }

    try {
      return JSON.parse(match[0]) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
}

function normalizeGroqSearchResults(executedTools: GroqExecutedTool[]) {
  const searchResults = executedTools.flatMap((tool) => {
    const results = Array.isArray(tool.search_results) ? tool.search_results : tool.results;

    return Array.isArray(results) ? results : [];
  });
  const seen = new Set<string>();
  const normalized: GroqSearchResult[] = [];

  for (const result of searchResults) {
    const url = typeof result.url === "string" ? result.url.trim() : "";

    if (!isSafeHttpUrl(url)) {
      continue;
    }

    const key = normalizeUrlForComparison(url);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalized.push({
      title: typeof result.title === "string" ? result.title.slice(0, 180) : undefined,
      url,
      content: typeof result.content === "string" ? result.content.slice(0, 260) : undefined,
      published_date: typeof result.published_date === "string" ? result.published_date : undefined,
      score: typeof result.score === "number" && Number.isFinite(result.score) ? result.score : undefined
    });
  }

  return normalized;
}

function normalizeSupportingMedia({
  url,
  type
}: {
  url: string | null;
  type: string | null;
}) {
  if (!url || !isSafeHttpUrl(url)) {
    return null;
  }

  const domain = normalizeDomain(undefined, url);
  const normalizedType = normalizeLabel(type);

  if (
    domain === "youtube.com" ||
    domain === "youtu.be" ||
    domain === "music.youtube.com"
  ) {
    return {
      url,
      type: "youtube"
    };
  }

  if (domain === "spotify.com" || domain === "open.spotify.com") {
    return {
      url,
      type: "spotify"
    };
  }

  if (normalizedType === "youtube" || normalizedType === "spotify") {
    return null;
  }

  return normalizedType === "other"
    ? {
        url,
        type: "other"
      }
    : null;
}

function hasSourceUrlInSearchResults(sourceUrl: string | null, searchResults: GroqSearchResult[]) {
  if (!sourceUrl) {
    return false;
  }

  const sourceKey = normalizeUrlForComparison(sourceUrl);

  return searchResults.some((result) => {
    if (!result.url) {
      return false;
    }

    const resultKey = normalizeUrlForComparison(result.url);

    if (resultKey === sourceKey || resultKey.includes(sourceKey) || sourceKey.includes(resultKey)) {
      return true;
    }

    return false;
  });
}

function getSupportingSearchResults(sourceUrl: string | null, searchResults: GroqSearchResult[]) {
  if (!sourceUrl) {
    return [];
  }

  const sourceDomain = normalizeDomain(undefined, sourceUrl);

  return searchResults.filter((result) => {
    if (!result.url) {
      return false;
    }

    return normalizeDomain(undefined, result.url) === sourceDomain;
  });
}

function normalizeUrlForComparison(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    url.search = "";

    return `${url.hostname.replace(/^www\./, "")}${url.pathname.replace(/\/+$/, "")}`.toLowerCase();
  } catch {
    return value.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "");
  }
}

function getEventRank(event: MarketEvent) {
  const rawPayload = event.rawPayload;
  const sourceTier = getNumber(rawPayload.sourceTier, 0);
  const evidenceLift = rawPayload.evidenceLevel === "confirmed" ? 16 : rawPayload.evidenceLevel === "reported" ? 10 : 0;
  const reachLift = rawPayload.reachScope === "mainstream" || rawPayload.reachScope === "broad" ? 12 : 6;

  return Math.abs(event.impactScore) * 1.35 + event.confidence * 35 + sourceTier * 10 + evidenceLift + reachLift;
}

function dedupeEvents(events: MarketEvent[]) {
  const seen = new Set<string>();
  const deduped: MarketEvent[] = [];

  for (const event of events) {
    const key = `${event.artistId}:${event.eventType}:${event.eventDate}:${normalizeEventKey(event.title)}:${event.sourceUrl}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(event);
  }

  return deduped;
}

function normalizeEventType(value: string | null): MarketEvent["eventType"] | null {
  const normalized = normalizeLabel(value);

  return EVENT_TYPES.has(normalized as MarketEvent["eventType"]) ? (normalized as MarketEvent["eventType"]) : null;
}

function normalizeEvidenceLevel(value: string | null) {
  const normalized = normalizeLabel(value);

  if (normalized === "confirmed" || normalized === "reported" || normalized === "rumor" || normalized === "low_signal") {
    return normalized;
  }

  return "reported";
}

function normalizeLabel(value: string | null) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getNumber(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function getBoolean(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return value.trim().toLowerCase() === "true";
  }

  return false;
}

function normalizeDate(value: string | null) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function isDateInsideWindow(date: string, runDate: string, lookbackDays: number) {
  const runTime = Date.parse(`${runDate}T00:00:00.000Z`);
  const eventTime = Date.parse(`${date}T00:00:00.000Z`);

  if (!Number.isFinite(runTime) || !Number.isFinite(eventTime)) {
    return true;
  }

  const distanceDays = Math.round((runTime - eventTime) / 86_400_000);

  return distanceDays >= -45 && distanceDays <= Math.max(1, lookbackDays);
}

function isSafeHttpUrl(value: string) {
  try {
    const url = new URL(value);

    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function normalizeEventKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
