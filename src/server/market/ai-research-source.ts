import { get as httpsGet } from "node:https";
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
  fanSentimentScore?: unknown;
  criticSentimentScore?: unknown;
  sentimentAgreement?: unknown;
  fanReactionEvidenceCount?: unknown;
  impactScore?: unknown;
  confidence?: unknown;
  sourceType?: unknown;
  evidenceLevel?: unknown;
  reachScope?: unknown;
  supportingMediaUrl?: unknown;
  supportingMediaType?: unknown;
  relatedArtistNames?: unknown;
  corroboratingSourceCount?: unknown;
  corroboratingSourceUrls?: unknown;
  publicReactionConfirmed?: unknown;
  factualClaimConfirmed?: unknown;
  marketConnection?: unknown;
  musicDemandConfirmed?: unknown;
  artistRole?: unknown;
  riskFlags?: unknown;
};

type AiResearchArtistRole = "primary" | "featured" | "mentioned";

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
  search_results?: GroqSearchResult[] | { results?: GroqSearchResult[] };
  results?: GroqSearchResult[];
};

type GroqSearchResult = {
  title?: string;
  url?: string;
  content?: string;
  published_date?: string;
  score?: number;
};

type MusicBrainzArtistIdentity = {
  name?: unknown;
  disambiguation?: unknown;
  aliases?: Array<{
    name?: unknown;
    type?: unknown;
  }>;
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
const DEFAULT_DELAY_MS = 12000;
const DEFAULT_TIMEOUT_MS = 25000;
const MAX_COMPLETION_TOKENS = 480;

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
const musicBrainzIdentityCache = new Map<string, Promise<string | null>>();

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

    const artistExternalIds = externalIds[artist.id];
    const identityContext = await loadMusicBrainzIdentityContext({
      musicbrainzId: artistExternalIds?.musicbrainzId,
      artistName: artist.name,
      timeoutMs: Math.min(timeoutMs, 6000)
    });
    const query = buildResearchQuery(artist, artistExternalIds, identityContext);
    let compactMode = false;
    let result = await fetchAiResearchEvents({
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

    if (!result.ok && isRequestTooLargeError(result.error)) {
      compactMode = true;
      result = await fetchAiResearchEvents({
        provider,
        apiKey: cleanApiKey,
        model: resolvedModel,
        artist,
        runDate,
        query,
        lookbackDays,
        maxEventsPerArtist: 1,
        timeoutMs,
        fetchImpl,
        compactMode
      });
    }

    if (!result.ok && isRateLimitError(result.error)) {
      await sleep(getRateLimitRetryDelayMs(result.error));
      result = await fetchAiResearchEvents({
        provider,
        apiKey: cleanApiKey,
        model: resolvedModel,
        artist,
        runDate,
        query,
        lookbackDays,
        maxEventsPerArtist,
        timeoutMs,
        fetchImpl,
        compactMode
      });
    }

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
        returnedCandidates: result.events.slice(0, 4).map((event) => ({
          title: getString(event.title),
          eventDate: getString(event.eventDate),
          eventType: getString(event.eventType),
          sourceName: getString(event.sourceName),
          sourceUrl: getString(event.sourceUrl),
          evidenceLevel: getString(event.evidenceLevel),
          confidence: getOptionalNumber(event.confidence),
          impactScore: getOptionalNumber(event.impactScore),
          fanSentimentScore: getOptionalNumber(event.fanSentimentScore),
          criticSentimentScore: getOptionalNumber(event.criticSentimentScore),
          fanReactionEvidenceCount: getOptionalNumber(event.fanReactionEvidenceCount),
          publicReactionConfirmed: getBoolean(event.publicReactionConfirmed),
          corroboratingSourceCount: getOptionalNumber(event.corroboratingSourceCount),
          riskFlags: Array.isArray(event.riskFlags) ? event.riskFlags.slice(0, 8) : []
        })),
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
  fetchImpl,
  compactMode = false
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
  compactMode?: boolean;
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
        "content-type": "application/json",
        "Groq-Model-Version": "2025-07-23"
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_completion_tokens: compactMode ? 320 : MAX_COMPLETION_TOKENS,
        compound_custom: {
          tools: {
            enabled_tools: ["web_search"]
          }
        },
        search_settings: {
          exclude_domains: ["azlyrics.com", "genius.com", "songmeanings.com"]
        },
        messages: [
          {
            role: "system",
            content: compactMode
              ? "Return compact JSON only. Use web evidence; never invent facts or URLs. Return {\"events\":[]} when evidence is weak."
              : "Return JSON only. Find current source-backed rap market catalysts. Never invent facts or URLs. If no public source supports a meaningful event, return {\"events\":[]}. Separate critic opinion from fan reception. Reject low-view uploads, generic fan praise, private pages, sarcasm, jokes, memes, coordinated brigading, and old items."
          },
          {
            role: "user",
            content: compactMode
              ? buildCompactResearchPrompt({ artist, runDate, query, lookbackDays })
              : buildResearchPrompt({
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
    `Verified identity context: ${query}. Return at most ${maxEventsPerArtist} source-backed events.`,
    "Run separate concise web searches for: (1) artist + latest release/news, (2) newest project title + review/reception, and (3) artist or project + fan reaction/community. Do not paste every topic into one search query.",
    "Use only meaningful catalysts: album/project/single/feature, review/reception, backlash/legal/health, viral performance/snippet, chart milestone, clear decline, or a major non-music event with measurable public reach.",
    "Classify marketConnection as direct_music when the event directly concerns music demand, career_availability when it changes the artist's ability to record, release, tour, or perform, or attention_only when it only raises celebrity visibility. Set musicDemandConfirmed true only when independent listening, chart, search, ticket, or fan-demand evidence connects the event to music interest. Never assume fame automatically means music demand.",
    "If many tracks dropped together, report the project, not one random track. Social/community items need factual confirmation and public reaction.",
    "For releases and reviews, actively search for reception using the release title plus fan reaction, Reddit, review, and community discussion terms. Keep fanSentimentScore separate from criticSentimentScore. A critic score is not fan consensus, and comments on the artist's own channel are biased evidence.",
    "Set publicReactionConfirmed true only when at least two independent, accessible sources support the same direction. Put every corroborating URL in corroboratingSourceUrls; the application verifies those URLs against your actual web-search results. Count only those sources in fanReactionEvidenceCount. Detect sarcasm, stan brigading, recycled posts, and disagreement; put risks in riskFlags.",
    "Use sentimentAgreement=agree when critics and fans align, mixed when reception is divided, disagree when they clearly diverge, or unknown. Scale reach relative to the artist: a scene-wide underground event can matter without being mainstream.",
    "Keep title, summary, and whyItMatters concise so the complete JSON fits without truncation.",
    "Set artistRole to primary only when this artist owns or is the main subject of the event, featured when they are a credited guest/collaborator, and mentioned when they are merely named. Never call another artist's project this artist's release.",
    "JSON shape: {\"events\":[{\"title\":\"headline\",\"eventDate\":\"YYYY-MM-DD\",\"eventType\":\"release|review|news|controversy|award|tour|viral\",\"sourceName\":\"source\",\"sourceUrl\":\"https://...\",\"summary\":\"fact\",\"whyItMatters\":\"market reason\",\"sentimentScore\":0,\"fanSentimentScore\":0,\"criticSentimentScore\":0,\"sentimentAgreement\":\"agree|mixed|disagree|unknown\",\"fanReactionEvidenceCount\":0,\"impactScore\":0,\"confidence\":0.0,\"artistRole\":\"primary|featured|mentioned\",\"sourceType\":\"music_publication|mainstream_news|review|official|community|social|video\",\"evidenceLevel\":\"confirmed|reported|rumor|low_signal\",\"reachScope\":\"underground|scene|broad|mainstream\",\"marketConnection\":\"direct_music|career_availability|attention_only\",\"musicDemandConfirmed\":false,\"supportingMediaUrl\":\"\",\"supportingMediaType\":\"none\",\"relatedArtistNames\":[],\"corroboratingSourceUrls\":[\"https://...\"],\"corroboratingSourceCount\":1,\"publicReactionConfirmed\":false,\"factualClaimConfirmed\":true,\"riskFlags\":[]}]}"
  ].join("\n");
}

function buildCompactResearchPrompt({
  artist,
  runDate,
  query,
  lookbackDays
}: {
  artist: MarketUpdateArtist;
  runDate: string;
  query: string;
  lookbackDays: number;
}) {
  return [
    `Find one meaningful, source-backed catalyst for ${artist.name} (${artist.ticker}) in the ${lookbackDays} days through ${runDate}. Verified identity terms: ${query}.`,
    "Use separate short web searches for latest release/news and for that release's review or fan reaction; do not combine every topic into one query.",
    "Prioritize the newest release or EP and its fan/critic reception, then major news, controversy, charts, tours, or viral performances. Classify marketConnection as direct_music, career_availability, or attention_only; set musicDemandConfirmed only with independent evidence connecting attention to music demand.",
    "Require a real accessible source URL. Search the newest release title with fan reaction, Reddit, review, and community terms. Fan sentiment needs two independent sources returned by web search; list them in corroboratingSourceUrls, otherwise set publicReactionConfirmed false and fanReactionEvidenceCount 0. Reject rumors, sarcasm, private posts, and low-view uploads.",
    "Return compact JSON: {\"events\":[{\"title\":\"\",\"eventDate\":\"YYYY-MM-DD\",\"eventType\":\"release|review|news|controversy|award|tour|viral\",\"sourceName\":\"\",\"sourceUrl\":\"https://\",\"summary\":\"\",\"sentimentScore\":0,\"fanSentimentScore\":0,\"criticSentimentScore\":0,\"sentimentAgreement\":\"agree|mixed|disagree|unknown\",\"fanReactionEvidenceCount\":0,\"impactScore\":0,\"confidence\":0.0,\"artistRole\":\"primary|featured|mentioned\",\"sourceType\":\"music_publication|mainstream_news|review|official|community|social|video\",\"evidenceLevel\":\"confirmed|reported|rumor|low_signal\",\"reachScope\":\"underground|scene|broad|mainstream\",\"marketConnection\":\"direct_music|career_availability|attention_only\",\"musicDemandConfirmed\":false,\"corroboratingSourceUrls\":[\"https://\"],\"corroboratingSourceCount\":1,\"publicReactionConfirmed\":false,\"factualClaimConfirmed\":true,\"riskFlags\":[]}]}."
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
  const marketConnection = normalizeMarketConnection(getString(value.marketConnection));
  const musicDemandConfirmed = getBoolean(value.musicDemandConfirmed);
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
  const claimedCorroboratingSourceCount = clamp(
    Math.round(getNumber(value.corroboratingSourceCount, 1)),
    0,
    12
  );
  const claimedFanReactionEvidenceCount = clamp(
    Math.round(getNumber(value.fanReactionEvidenceCount, 0)),
    0,
    20
  );
  const corroboratingSourceUrls = normalizeEvidenceUrls(value.corroboratingSourceUrls);
  const verifiedCorroboratingSources = getVerifiedIndependentSources(
    [sourceUrl, ...corroboratingSourceUrls],
    searchResults
  );
  const corroboratingSourceCount = verifiedCorroboratingSources.length;
  const fanReactionEvidenceCount = Math.min(
    claimedFanReactionEvidenceCount,
    corroboratingSourceCount
  );
  const publicReactionConfirmed =
    getBoolean(value.publicReactionConfirmed) && fanReactionEvidenceCount >= 2;
  const fanSentimentScore = getOptionalNumber(value.fanSentimentScore);
  const criticSentimentScore = getOptionalNumber(value.criticSentimentScore);
  const sentimentAgreement = normalizeSentimentAgreement(getString(value.sentimentAgreement));
  const rawSentimentScore = resolveEvidenceWeightedSentiment({
    aggregateSentiment: getNumber(value.sentimentScore, classification?.sentimentScore ?? 0),
    fanSentiment: fanSentimentScore,
    criticSentiment: criticSentimentScore,
    publicReactionConfirmed,
    fanReactionEvidenceCount,
    sentimentAgreement
  });
  const rawImpactScore = clamp(
    getNumber(value.impactScore, classification?.impactScore ?? rawSentimentScore),
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
  const factualClaimConfirmed = getBoolean(value.factualClaimConfirmed);
  const artistRole = normalizeArtistRole(getString(value.artistRole), title, artist.name);

  if (artistRole === "mentioned") {
    return null;
  }

  const roleImpactMultiplier = artistRole === "featured" ? 0.68 : 1;
  const roleSentimentMultiplier = artistRole === "featured" ? 0.82 : 1;
  const sentimentScore = clamp(rawSentimentScore * roleSentimentMultiplier, -100, 100);
  const impactScore = clamp(rawImpactScore * roleImpactMultiplier, -100, 100);

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
      marketConnection,
      musicDemandConfirmed,
      artistRole,
      roleImpactMultiplier,
      summary,
      whyItMatters,
      relatedArtistNames,
      corroboratingSourceCount,
      claimedCorroboratingSourceCount,
      corroboratingSourceUrls,
      verifiedCorroboratingSourceUrls: verifiedCorroboratingSources.map((source) => source.url),
      publicReactionConfirmed,
      fanReactionEvidenceCount,
      claimedFanReactionEvidenceCount,
      fanSentimentScore,
      criticSentimentScore,
      sentimentAgreement,
      factualClaimConfirmed,
      riskFlags,
      executedToolCount,
      sourceWasFoundBySearch,
      searchResultCount: searchResults.length,
      supportingSearchResults: getSupportingSearchResults(sourceUrl, searchResults).slice(0, 4),
      supportingMediaUrl: supportingMedia?.url ?? null,
      supportingMediaType: supportingMedia?.type ?? null,
      classificationReason:
        artistRole === "featured" ? "artist_feature_credit" : classification?.reason ?? "ai_research_classification",
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
      "bot",
      "brigad",
      "coordinated",
      "astroturf"
    ].some((term) => normalized.includes(term));
  });
}

function normalizeSentimentAgreement(value: string | null) {
  const normalized = normalizeLabel(value);

  if (normalized === "agree" || normalized === "mixed" || normalized === "disagree") {
    return normalized;
  }

  return "unknown";
}

function normalizeMarketConnection(value: string | null) {
  const normalized = normalizeLabel(value);

  if (
    normalized === "direct_music" ||
    normalized === "career_availability" ||
    normalized === "attention_only"
  ) {
    return normalized;
  }

  return "unknown";
}

function resolveEvidenceWeightedSentiment({
  aggregateSentiment,
  fanSentiment,
  criticSentiment,
  publicReactionConfirmed,
  fanReactionEvidenceCount,
  sentimentAgreement
}: {
  aggregateSentiment: number;
  fanSentiment: number | null;
  criticSentiment: number | null;
  publicReactionConfirmed: boolean;
  fanReactionEvidenceCount: number;
  sentimentAgreement: string;
}) {
  const confirmedFanSentiment =
    publicReactionConfirmed && fanReactionEvidenceCount >= 2 && fanSentiment !== null
      ? clamp(fanSentiment, -100, 100)
      : null;
  const cleanCriticSentiment = criticSentiment === null ? null : clamp(criticSentiment, -100, 100);
  let resolved = clamp(aggregateSentiment, -100, 100);

  if (confirmedFanSentiment !== null && cleanCriticSentiment !== null) {
    resolved = confirmedFanSentiment * 0.65 + cleanCriticSentiment * 0.35;
  } else if (confirmedFanSentiment !== null) {
    resolved = confirmedFanSentiment;
  } else if (cleanCriticSentiment !== null) {
    resolved = cleanCriticSentiment;
  }

  const disagreementMultiplier =
    sentimentAgreement === "disagree" ? 0.55 : sentimentAgreement === "mixed" ? 0.72 : 1;

  return clamp(resolved * disagreementMultiplier, -100, 100);
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

function buildResearchQuery(
  artist: MarketUpdateArtist,
  externalIds?: ArtistExternalIds,
  identityContext?: string | null
) {
  const identityQuery = externalIds?.gdeltQuery?.trim() || buildDefaultGdeltQuery(artist.name);
  const verifiedIdentity = identityContext ? ` ${identityContext}` : "";

  return `${identityQuery}${verifiedIdentity}`;
}

async function loadMusicBrainzIdentityContext({
  musicbrainzId,
  artistName,
  timeoutMs
}: {
  musicbrainzId?: string;
  artistName: string;
  timeoutMs: number;
}) {
  const id = musicbrainzId?.trim().toLowerCase();

  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) {
    return null;
  }

  const cached = musicBrainzIdentityCache.get(id);

  if (cached) {
    return cached;
  }

  const request = fetchMusicBrainzIdentityContext({
    musicbrainzId: id,
    artistName,
    timeoutMs
  });
  musicBrainzIdentityCache.set(id, request);
  return request;
}

async function fetchMusicBrainzIdentityContext({
  musicbrainzId,
  artistName,
  timeoutMs
}: {
  musicbrainzId: string;
  artistName: string;
  timeoutMs: number;
}) {
  try {
    const url = new URL(`https://musicbrainz.org/ws/2/artist/${musicbrainzId}`);
    url.searchParams.set("fmt", "json");
    url.searchParams.set("inc", "aliases");
    const value = await fetchMusicBrainzArtistIdentity(url, timeoutMs);

    if (!value) {
      return null;
    }
    const normalizedArtistName = normalizeIdentityTerm(artistName);
    const disambiguation = getString(value.disambiguation);
    const aliases = (value.aliases ?? [])
      .map((alias) => ({
        name: getString(alias.name),
        type: normalizeLabel(getString(alias.type))
      }))
      .filter((alias): alias is { name: string; type: string } => Boolean(alias.name))
      .filter((alias) => normalizeIdentityTerm(alias.name) !== normalizedArtistName)
      .filter((alias) => /^[\x20-\x7e]+$/.test(alias.name))
      .sort((first, second) => getIdentityAliasPriority(second.type) - getIdentityAliasPriority(first.type))
      .slice(0, 2)
      .map((alias) => `"${alias.name.replaceAll('"', "")}"`);
    const terms = [disambiguation, ...aliases].filter((term): term is string => Boolean(term));

    return terms.length ? terms.join(" ") : null;
  } catch {
    return null;
  }
}

function fetchMusicBrainzArtistIdentity(url: URL, timeoutMs: number) {
  return new Promise<MusicBrainzArtistIdentity | null>((resolve) => {
    const request = httpsGet(
      url,
      {
        headers: {
          accept: "application/json",
          "user-agent": "RapMarketIndex/1.0 (https://rap-market-index.vercel.app)"
        }
      },
      (response) => {
        if (response.statusCode !== 200) {
          response.resume();
          resolve(null);
          return;
        }

        const chunks: Buffer[] = [];
        let byteLength = 0;

        response.on("data", (chunk: Buffer) => {
          byteLength += chunk.length;

          if (byteLength > 100_000) {
            request.destroy(new Error("MusicBrainz identity response was too large."));
            return;
          }

          chunks.push(chunk);
        });
        response.on("end", () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")) as MusicBrainzArtistIdentity);
          } catch {
            resolve(null);
          }
        });
      }
    );

    request.setTimeout(timeoutMs, () => request.destroy(new Error("MusicBrainz identity request timed out.")));
    request.on("error", () => resolve(null));
  });
}

function normalizeIdentityTerm(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function getIdentityAliasPriority(type: string) {
  if (type === "artist_name") {
    return 3;
  }

  if (type === "legal_name") {
    return 2;
  }

  return 1;
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
    const results = Array.isArray(tool.search_results)
      ? tool.search_results
      : tool.search_results && typeof tool.search_results === "object" && Array.isArray(tool.search_results.results)
        ? tool.search_results.results
        : tool.results;

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

function normalizeEvidenceUrls(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((item) => getString(item))
        .filter((item): item is string => Boolean(item && isSafeHttpUrl(item)))
    )
  ).slice(0, 8);
}

function getVerifiedIndependentSources(urls: Array<string | null>, searchResults: GroqSearchResult[]) {
  const domains = new Set<string>();
  const verified: Array<{ domain: string; url: string }> = [];

  for (const candidateUrl of urls) {
    if (!candidateUrl || !isSafeHttpUrl(candidateUrl)) {
      continue;
    }

    const candidateKey = normalizeUrlForComparison(candidateUrl);
    const matchingResult = searchResults.find((result) => {
      if (!result.url) {
        return false;
      }

      const resultKey = normalizeUrlForComparison(result.url);

      return resultKey === candidateKey || resultKey.includes(candidateKey) || candidateKey.includes(resultKey);
    });

    if (!matchingResult?.url) {
      continue;
    }

    const domain = normalizeDomain(undefined, matchingResult.url);

    if (!domain || domains.has(domain)) {
      continue;
    }

    domains.add(domain);
    verified.push({ domain, url: matchingResult.url });
  }

  return verified;
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

function normalizeArtistRole(
  value: string | null,
  title: string | null,
  artistName: string
): AiResearchArtistRole {
  const normalized = normalizeLabel(value);

  if (normalized === "primary" || normalized === "featured" || normalized === "mentioned") {
    return normalized;
  }

  if (normalized === "guest" || normalized === "collaborator") {
    return "featured";
  }

  if (normalized === "incidental") {
    return "mentioned";
  }

  const normalizedTitle = (title ?? "").toLowerCase();
  const featurePrefix = "(?:featuring|feat\\.?|ft\\.?|with|assisted by|alongside)";

  for (const term of getArtistRoleTerms(artistName)) {
    const escapedTerm = escapeRegExp(term).replace(/\s+/g, "\\s+");
    const featurePattern = new RegExp(
      `${featurePrefix}[^,:;|]{0,42}\\b${escapedTerm}\\b`,
      "i"
    );

    if (featurePattern.test(normalizedTitle)) {
      return "featured";
    }
  }

  return "primary";
}

function getArtistRoleTerms(artistName: string) {
  const normalized = artistName
    .toLowerCase()
    .replace(/[^a-z0-9$]+/g, " ")
    .trim();
  const terms = new Set<string>([normalized]);

  if (normalized.startsWith("youngboy never broke again")) {
    terms.add("youngboy");
    terms.add("nba youngboy");
  }

  if (normalized === "a$ap rocky" || normalized === "asap rocky") {
    terms.add("a$ap rocky");
    terms.add("asap rocky");
  }

  return [...terms].filter(Boolean);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

function getOptionalNumber(value: unknown) {
  const parsed = getNumber(value, Number.NaN);

  return Number.isFinite(parsed) ? parsed : null;
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

function isRateLimitError(message: string) {
  const normalized = message.toLowerCase();

  return normalized.includes("rate limit") || normalized.includes("too many requests") || normalized.includes("http 429");
}

function isRequestTooLargeError(message: string) {
  const normalized = message.toLowerCase();

  return normalized.includes("request entity too large") || normalized.includes("request_too_large") || normalized.includes("http 413");
}

function getRateLimitRetryDelayMs(message: string) {
  const match = message.match(/try again in\s+([\d.]+)\s*(ms|s)/i);

  if (!match) {
    return 16000;
  }

  const value = Number(match[1]);
  const milliseconds = match[2].toLowerCase() === "ms" ? value : value * 1000;

  return clamp(Math.ceil(milliseconds + 1250), 5000, 30000);
}
