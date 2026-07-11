import type { MarketUpdateArtist } from "@/server/market/daily-update";
import {
  hasArtistControversySubjectContext,
  hasArtistFeatureCreditContext,
  hasArtistReleaseSubjectContext,
  hasArtistStatusSubjectContext,
  hasRequiredArtistEventDisambiguation,
  isGenericMusicListicleTitle,
  isLowValueMarketArticleTitle,
  isUncorroboratedLowTierMarketClaim
} from "@/server/market/artist-event-disambiguation";
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

type MediaRssCollectOptions = {
  artists: MarketUpdateArtist[];
  runDate: string;
  externalIds?: Record<string, ArtistExternalIds>;
  feedUrls?: string[];
  includeGoogleNews?: boolean;
  lookbackDays?: number;
  maxItemsPerFeed?: number;
  maxEventsPerArtist?: number;
  delayMs?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

type FeedFetchResult =
  | {
      ok: true;
      feedUrl: string;
      items: MediaFeedItem[];
    }
  | {
      ok: false;
      feedUrl: string;
      error: string;
    };

type MediaFeedItem = {
  title: string;
  url: string;
  domain: string;
  sourceName: string;
  publishedDate: string | null;
  summary: string;
  thumbnailUrl?: string | null;
  feedUrl: string;
  feedScope: "global" | "artist_search";
  searchArtistId?: string;
  searchQuery?: string;
};

export type MediaRssMarketEvents = {
  observations: MarketObservation[];
  eventsByArtist: Record<string, MarketEvent[]>;
  warnings: string[];
  scannedFeedCount: number;
};

const SOURCE = "media_rss";
const ARTICLE_COUNT = "article_count";
const SOURCE_COUNT = "source_count";
const CLASSIFIED_EVENT_COUNT = "classified_event_count";
const REQUEST_ERROR = "request_error";
const DEFAULT_LOOKBACK_DAYS = 30;
const DEFAULT_MAX_ITEMS_PER_FEED = 40;
const DEFAULT_MAX_EVENTS_PER_ARTIST = 4;
const DEFAULT_DELAY_MS = 250;
const DEFAULT_TIMEOUT_MS = 12000;
const GOOGLE_NEWS_BASE_URL = "https://news.google.com/rss/search";

const DEFAULT_FEED_URLS = [
  "https://www.hotnewhiphop.com/feed/",
  "https://allhiphop.com/feed/",
  "https://www.rap-up.com/feed/",
  "https://www.thefader.com/feed.rss",
  "https://uproxx.com/music/feed/",
  "https://consequence.net/hip-hop/feed/",
  "https://pitchfork.com/feed/feed-news/rss",
  "https://pitchfork.com/feed/feed-album-reviews/rss",
  "https://www.xxlmag.com/feed/",
  "https://stereogum.com/feed",
  "https://hypebeast.com/music/feed",
  "https://www.nme.com/feed",
  "https://www.youtube.com/feeds/videos.xml?channel_id=UCt7fwAhXDy3oNFTAzF2o8Pw"
];

export function getDefaultMediaRssFeedUrls() {
  return [...DEFAULT_FEED_URLS];
}

export async function collectMediaRssMarketEvents({
  artists,
  runDate,
  externalIds = {},
  feedUrls,
  includeGoogleNews = true,
  lookbackDays = DEFAULT_LOOKBACK_DAYS,
  maxItemsPerFeed = DEFAULT_MAX_ITEMS_PER_FEED,
  maxEventsPerArtist = DEFAULT_MAX_EVENTS_PER_ARTIST,
  delayMs = DEFAULT_DELAY_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl = fetch
}: MediaRssCollectOptions): Promise<MediaRssMarketEvents> {
  const observations: MarketObservation[] = [];
  const eventsByArtist: Record<string, MarketEvent[]> = {};
  const warnings: string[] = [];
  const normalizedFeedUrls = normalizeFeedUrls(feedUrls);
  const globalFeedResults = await fetchFeeds({
    feedUrls: normalizedFeedUrls.length ? normalizedFeedUrls : DEFAULT_FEED_URLS,
    runDate,
    feedScope: "global",
    maxItemsPerFeed,
    delayMs,
    timeoutMs,
    fetchImpl
  });
  const globalItems = collectOkItems(globalFeedResults);
  let scannedFeedCount = globalFeedResults.length;

  pushFeedWarnings(warnings, globalFeedResults);

  for (const [index, artist] of artists.entries()) {
    const query = buildArtistNewsQuery(artist, externalIds[artist.id]);
    let artistSearchItems: MediaFeedItem[] = [];

    if (includeGoogleNews) {
      if (index > 0 && delayMs > 0) {
        await sleep(delayMs);
      }

      const feedUrl = buildGoogleNewsFeedUrl(query, lookbackDays);
      const result = await fetchFeed({
        feedUrl,
        runDate,
        feedScope: "artist_search",
        searchArtistId: artist.id,
        searchQuery: query,
        maxItemsPerFeed,
        timeoutMs,
        fetchImpl
      });

      scannedFeedCount += 1;

      if (result.ok) {
        artistSearchItems = result.items;
      } else {
        warnings.push(`${artist.ticker}: media search feed failed: ${result.error}`);
        observations.push(
          createObservation(artist.id, runDate, REQUEST_ERROR, 1, "flag", {
            source: SOURCE,
            feedUrl,
            query,
            error: result.error
          })
        );
      }
    }

    const artistEvents = buildArtistEvents({
      artist,
      runDate,
      query,
      items: dedupeItems([...globalItems, ...artistSearchItems]),
      lookbackDays,
      maxEventsPerArtist
    });

    observations.push(...artistEvents.observations);

    if (artistEvents.events.length) {
      eventsByArtist[artist.id] = artistEvents.events;
    }
  }

  return {
    observations,
    eventsByArtist,
    warnings,
    scannedFeedCount
  };
}

function buildArtistEvents({
  artist,
  runDate,
  query,
  items,
  lookbackDays,
  maxEventsPerArtist
}: {
  artist: MarketUpdateArtist;
  runDate: string;
  query: string;
  items: MediaFeedItem[];
  lookbackDays: number;
  maxEventsPerArtist: number;
}) {
  const matchedItems = items
    .filter((item) => !item.searchArtistId || item.searchArtistId === artist.id)
    .filter((item) => isWithinLookback(item.publishedDate ?? runDate, runDate, lookbackDays))
    .map((item) => ({
      item,
      titleMatchedArtist: mentionsArtist(item.title, artist.name, query),
      textMatchedArtist: mentionsArtist(`${item.title} ${item.summary}`, artist.name, query),
      disambiguatedArtist: hasRequiredArtistDisambiguation({ artist, item })
    }))
    .filter(({ titleMatchedArtist, textMatchedArtist, disambiguatedArtist }) =>
      (titleMatchedArtist || textMatchedArtist) && disambiguatedArtist
    );

  const candidateEvents = matchedItems
    .map(({ item, titleMatchedArtist, textMatchedArtist, disambiguatedArtist }) => {
      const classificationText = `${item.title} ${item.summary}`.slice(0, 420);
      const initialClassification = classifyArticleEvent(classificationText, item.domain, undefined, {
        allowLowTierRelease: item.feedScope === "artist_search" && (titleMatchedArtist || textMatchedArtist)
      });

      if (!initialClassification) {
        return null;
      }

      const artistRole = hasArtistFeatureCreditContext({
        artistName: artist.name,
        text: classificationText,
        query
      })
        ? "featured"
        : "primary";
      const classification =
        initialClassification.eventType === "release" && artistRole === "featured"
          ? {
              ...initialClassification,
              eventType: "viral" as const,
              sentimentScore: 30,
              impactScore: 48,
              confidence: Math.min(initialClassification.confidence, 0.82),
              reason: "feature_terms",
              releaseKind: undefined
            }
          : initialClassification;

      const sourceTier = getSourceTier(item.domain);
      const subjectMatchedArtist = hasRequiredEventSubjectContext({
        artist,
        query,
        item,
        classificationText,
        classification
      });

      if (!subjectMatchedArtist) {
        return null;
      }

      if (isLowValueMarketArticleTitle(item.title) && !classification.statusSubtype) {
        return null;
      }

      if (
        classification.eventType === "release" &&
        isGenericMusicListicleTitle(item.title) &&
        !extractProjectTitle(`${item.title} ${item.summary}`)
      ) {
        return null;
      }

      if (
        !isRelevantMediaEvent({
          item,
          sourceTier,
          titleMatchedArtist,
          textMatchedArtist,
          eventType: classification.eventType,
          classificationReason: classification.reason,
          impactScore: classification.impactScore
        })
      ) {
        return null;
      }

      return {
        item,
        titleMatchedArtist,
        textMatchedArtist,
        disambiguatedArtist,
        subjectMatchedArtist,
        artistRole,
        sourceTier,
        classification
      };
    })
    .filter((value): value is NonNullable<typeof value> => Boolean(value))
    .sort((first, second) => getEventRank(second) - getEventRank(first))
    .slice(0, maxEventsPerArtist);

  const events = candidateEvents.map(({ item, titleMatchedArtist, textMatchedArtist, disambiguatedArtist, subjectMatchedArtist, artistRole, sourceTier, classification }) => {
    const classificationText = `${item.title} ${item.summary}`.slice(0, 600);
    const releaseDate = getReleaseEventDate({
      text: classificationText,
      runDate,
      publishedDate: item.publishedDate,
      releaseKind: classification.releaseKind
    });
    const inferredTitle = getInferredReleaseTitle({
      artistName: artist.name,
      articleTitle: item.title,
      text: classificationText,
      releaseKind: classification.releaseKind
    });

    return {
      artistId: artist.id,
      eventDate: releaseDate ?? item.publishedDate ?? runDate,
      eventType: classification.eventType,
      title: (inferredTitle ?? item.title).slice(0, 160),
      sourceName: item.sourceName || item.domain,
      sourceUrl: item.url,
      sentimentScore: classification.sentimentScore,
      impactScore: classification.impactScore,
      confidence: classification.confidence,
      rawPayload: {
        source: "media_rss_item",
        feedUrl: item.feedUrl,
        feedScope: item.feedScope,
        searchQuery: item.searchQuery ?? null,
        domain: item.domain,
        sourceTier,
        publishedDate: item.publishedDate,
        releaseDate,
        classificationReason: classification.reason,
        releaseKind: classification.releaseKind ?? null,
        statusSubtype: classification.statusSubtype ?? null,
        statusSeverity: classification.statusSeverity ?? null,
        statusHaltRecommended: classification.statusHaltRecommended ?? false,
        inferredReleaseTitle: inferredTitle,
        thumbnailUrl: item.thumbnailUrl ?? null,
        titleMatchedArtist,
        textMatchedArtist,
        disambiguatedArtist,
        subjectMatchedArtist,
        artistRole
      }
    };
  });

  const sourceCount = new Set(matchedItems.map(({ item }) => item.domain)).size;
  const rawPayload = {
    source: SOURCE,
    query,
    runDate,
    matchedArticleCount: matchedItems.length,
    sourceCount,
    classifiedEventCount: events.length,
    topArticles: matchedItems.slice(0, 6).map(({ item, titleMatchedArtist, textMatchedArtist }) => ({
      title: item.title,
      domain: item.domain,
      sourceName: item.sourceName,
      url: item.url,
      publishedDate: item.publishedDate,
      thumbnailUrl: item.thumbnailUrl ?? null,
      feedScope: item.feedScope,
      titleMatchedArtist,
      textMatchedArtist
    }))
  };

  return {
    events,
    observations: [
      createObservation(artist.id, runDate, ARTICLE_COUNT, matchedItems.length, "articles", rawPayload),
      createObservation(artist.id, runDate, SOURCE_COUNT, sourceCount, "domains", rawPayload),
      createObservation(artist.id, runDate, CLASSIFIED_EVENT_COUNT, events.length, "events", rawPayload)
    ]
  };
}

function hasRequiredArtistDisambiguation({
  artist,
  item
}: {
  artist: MarketUpdateArtist;
  item: MediaFeedItem;
}) {
  return hasRequiredArtistEventDisambiguation({
    artistName: artist.name,
    text: `${item.title} ${item.summary}`,
    query: item.searchQuery,
    sourceTier: getSourceTier(item.domain)
  });
}

function hasRequiredEventSubjectContext({
  artist,
  query,
  item,
  classificationText,
  classification
}: {
  artist: MarketUpdateArtist;
  query: string;
  item: MediaFeedItem;
  classificationText: string;
  classification: ReturnType<typeof classifyArticleEvent> & {};
}) {
  const text = `${item.title} ${classificationText}`;

  if (classification.statusSubtype) {
    return hasArtistStatusSubjectContext({
      artistName: artist.name,
      text,
      query,
      statusSubtype: classification.statusSubtype
    });
  }

  if (classification.reason === "release_terms") {
    return hasArtistReleaseSubjectContext({
      artistName: artist.name,
      text,
      query
    });
  }

  if (classification.reason === "controversy_terms") {
    return hasArtistControversySubjectContext({
      artistName: artist.name,
      text,
      query
    });
  }

  return true;
}

function isRelevantMediaEvent({
  item,
  sourceTier,
  titleMatchedArtist,
  textMatchedArtist,
  eventType,
  classificationReason,
  impactScore
}: {
  item: MediaFeedItem;
  sourceTier: number;
  titleMatchedArtist: boolean;
  textMatchedArtist: boolean;
  eventType: MarketEvent["eventType"];
  classificationReason: string;
  impactScore: number;
}) {
  if (
    isUncorroboratedLowTierMarketClaim({
      sourceTier,
      classificationReason
    })
  ) {
    return false;
  }

  if (sourceTier <= 0) {
    if (looksLikeCopiedMediaUploadTitle(item.title)) {
      return false;
    }

    if (eventType === "release") {
      return false;
    }

    return (
      item.feedScope === "artist_search" &&
      titleMatchedArtist &&
      Math.abs(impactScore) >= 34 &&
      ["news", "tour", "viral"].includes(eventType) &&
      classificationReason !== "release_terms"
    );
  }

  if (titleMatchedArtist) {
    return true;
  }

  return false;
}

function looksLikeCopiedMediaUploadTitle(title: string) {
  const normalized = title.toLowerCase();

  return (
    /\[[^\]]*(official\s+audio|official\s+video|lyric\s+video|visualizer)[^\]]*\]/i.test(title) ||
    /\b(official\s+audio|official\s+video|official\s+lyric\s+video|lyric\s+video|visualizer)\b/i.test(title) ||
    /\([a-z0-9_-]{8,}\)/i.test(title) ||
    normalized.includes("youtube") ||
    normalized.includes("soundcloud")
  );
}

function getEventRank(value: {
  item: MediaFeedItem;
  sourceTier: number;
  classification: { impactScore: number; confidence: number };
}) {
  const freshness = value.item.publishedDate ? 12 : 0;

  return (
    Math.abs(value.classification.impactScore) * 1.3 +
    value.classification.confidence * 24 +
    value.sourceTier * 12 +
    freshness
  );
}

async function fetchFeeds({
  feedUrls,
  runDate,
  feedScope,
  maxItemsPerFeed,
  delayMs,
  timeoutMs,
  fetchImpl
}: {
  feedUrls: string[];
  runDate: string;
  feedScope: MediaFeedItem["feedScope"];
  maxItemsPerFeed: number;
  delayMs: number;
  timeoutMs: number;
  fetchImpl: typeof fetch;
}) {
  const results: FeedFetchResult[] = [];

  for (const [index, feedUrl] of feedUrls.entries()) {
    if (index > 0 && delayMs > 0) {
      await sleep(delayMs);
    }

    results.push(
      await fetchFeed({
        feedUrl,
        runDate,
        feedScope,
        maxItemsPerFeed,
        timeoutMs,
        fetchImpl
      })
    );
  }

  return results;
}

async function fetchFeed({
  feedUrl,
  runDate,
  feedScope,
  searchArtistId,
  searchQuery,
  maxItemsPerFeed,
  timeoutMs,
  fetchImpl
}: {
  feedUrl: string;
  runDate: string;
  feedScope: MediaFeedItem["feedScope"];
  searchArtistId?: string;
  searchQuery?: string;
  maxItemsPerFeed: number;
  timeoutMs: number;
  fetchImpl: typeof fetch;
}): Promise<FeedFetchResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(feedUrl, {
      signal: controller.signal,
      headers: {
        accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
        "user-agent": "rap-market-index/0.1 market media scanner"
      }
    });
    const text = await response.text();

    if (!response.ok) {
      return {
        ok: false,
        feedUrl,
        error: text.slice(0, 160) || `HTTP ${response.status}`
      };
    }

    return {
      ok: true,
      feedUrl,
      items: parseFeedItems({
        xml: text,
        feedUrl,
        feedScope,
        searchArtistId,
        searchQuery,
        runDate
      }).slice(0, maxItemsPerFeed)
    };
  } catch (error) {
    return {
      ok: false,
      feedUrl,
      error: error instanceof Error ? error.message : "Feed request failed."
    };
  } finally {
    clearTimeout(timeout);
  }
}

function parseFeedItems({
  xml,
  feedUrl,
  feedScope,
  searchArtistId,
  searchQuery,
  runDate
}: {
  xml: string;
  feedUrl: string;
  feedScope: MediaFeedItem["feedScope"];
  searchArtistId?: string;
  searchQuery?: string;
  runDate: string;
}) {
  const blocks = matchBlocks(xml, "item");
  const atomBlocks = blocks.length ? [] : matchBlocks(xml, "entry");
  const allBlocks = blocks.length ? blocks : atomBlocks;

  return allBlocks
    .map((block) => parseFeedItem({ block, feedUrl, feedScope, searchArtistId, searchQuery, runDate }))
    .filter((item): item is MediaFeedItem => Boolean(item));
}

function parseFeedItem({
  block,
  feedUrl,
  feedScope,
  searchArtistId,
  searchQuery,
  runDate
}: {
  block: string;
  feedUrl: string;
  feedScope: MediaFeedItem["feedScope"];
  searchArtistId?: string;
  searchQuery?: string;
  runDate: string;
}): MediaFeedItem | null {
  const title = normalizeTextValue(getTag(block, ["title"]));
  const link = normalizeFeedLink(getTag(block, ["link"]) ?? getAtomLink(block));
  const guid = normalizeFeedLink(getTag(block, ["guid", "id"]));
  const url = link ?? guid;
  const sourceUrl = getSourceUrl(block);
  const domain = normalizeDomain(undefined, sourceUrl ?? url ?? feedUrl);
  const sourceName = normalizeTextValue(getTag(block, ["source"])) || domain || "Media RSS";
  const publishedDate =
    parseFeedDate(getTag(block, ["pubDate", "published", "updated", "dc:date"])) ??
    parseFeedDate(getTag(block, ["lastBuildDate"])) ??
    runDate;
  const rawSummary = getTag(block, ["description", "summary", "content:encoded"]);
  const summary = normalizeTextValue(rawSummary) ?? "";
  const thumbnailUrl = getFeedImageUrl(block, rawSummary);

  if (!title || !url || !domain) {
    return null;
  }

  return {
    title,
    url,
    domain,
    sourceName,
    publishedDate,
    summary,
    thumbnailUrl,
    feedUrl,
    feedScope,
    searchArtistId,
    searchQuery
  };
}

function buildArtistNewsQuery(artist: MarketUpdateArtist, externalIds?: ArtistExternalIds) {
  const baseQuery = externalIds?.gdeltQuery?.trim() || buildDefaultGdeltQuery(artist.name);
  const primaryName = quoteSearchPhrase(externalIds?.lastfmName || artist.name);
  const catalystTerms = [
    "album",
    "mixtape",
    "EP",
    "single",
    "feature",
    "tracklist",
    "review",
    "controversy",
    "fight",
    "arrest",
    "viral",
    "snippet",
    "performance",
    "tour"
  ].join(" OR ");

  return `(${baseQuery} OR ${primaryName}) (${catalystTerms})`;
}

function buildGoogleNewsFeedUrl(query: string, lookbackDays: number) {
  const url = new URL(GOOGLE_NEWS_BASE_URL);

  url.searchParams.set("q", `${query} when:${Math.max(1, Math.min(30, lookbackDays))}d`);
  url.searchParams.set("hl", "en-US");
  url.searchParams.set("gl", "US");
  url.searchParams.set("ceid", "US:en");

  return url.toString();
}

function collectOkItems(results: FeedFetchResult[]) {
  return dedupeItems(results.flatMap((result) => (result.ok ? result.items : [])));
}

function pushFeedWarnings(warnings: string[], results: FeedFetchResult[]) {
  const failed = results.filter((result): result is Extract<FeedFetchResult, { ok: false }> => !result.ok);

  for (const result of failed.slice(0, 5)) {
    warnings.push(`Media RSS feed failed (${result.feedUrl}): ${result.error}`);
  }

  if (failed.length > 5) {
    warnings.push(`Media RSS skipped ${failed.length - 5} additional failed feed(s).`);
  }
}

function dedupeItems(items: MediaFeedItem[]) {
  const seen = new Set<string>();
  const deduped: MediaFeedItem[] = [];

  for (const item of items) {
    const key = `${item.url || item.title}:${item.publishedDate ?? ""}`.toLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(item);
  }

  return deduped;
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

function normalizeFeedUrls(feedUrls: string[] | undefined) {
  return Array.from(
    new Set(
      (feedUrls ?? [])
        .map((value) => value.trim())
        .filter((value) => {
          try {
            const url = new URL(value);
            return url.protocol === "https:" || url.protocol === "http:";
          } catch {
            return false;
          }
        })
    )
  );
}

function matchBlocks(xml: string, tagName: string) {
  return Array.from(xml.matchAll(new RegExp(`<${tagName}\\b[\\s\\S]*?<\\/${tagName}>`, "gi")), (match) => match[0]);
}

function getTag(block: string, tagNames: string[]) {
  for (const tagName of tagNames) {
    const match = block.match(new RegExp(`<${escapeRegExp(tagName)}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapeRegExp(tagName)}>`, "i"));

    if (match?.[1]) {
      return decodeXml(stripCdata(match[1]));
    }
  }

  return null;
}

function getAtomLink(block: string) {
  const match = block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/i);

  return match?.[1] ? decodeXml(match[1]) : null;
}

function getSourceUrl(block: string) {
  const match = block.match(/<source\b[^>]*url=["']([^"']+)["'][^>]*>/i);

  return match?.[1] ? decodeXml(match[1]) : null;
}

function getFeedImageUrl(block: string, rawSummary: string | null) {
  const directAttributeUrl =
    getTagAttribute(block, "media:thumbnail", "url") ??
    getTagAttribute(block, "media:content", "url") ??
    getTagAttribute(block, "enclosure", "url") ??
    getTagAttribute(block, "itunes:image", "href");
  const nestedImageUrl = getTag(block, ["url"]);
  const summaryImageUrl = getImageUrlFromHtml(rawSummary);

  return [directAttributeUrl, nestedImageUrl, summaryImageUrl]
    .map((value) => normalizeFeedLink(value))
    .filter((value): value is string => Boolean(value))
    .find((value) => isLikelyImageUrl(value)) ?? null;
}

function getTagAttribute(block: string, tagName: string, attributeName: string) {
  const match = block.match(new RegExp(`<${escapeRegExp(tagName)}\\b[^>]*\\s${escapeRegExp(attributeName)}=["']([^"']+)["'][^>]*>`, "i"));

  return match?.[1] ? decodeXml(match[1]) : null;
}

function getImageUrlFromHtml(value: string | null) {
  const match = value?.match(/<img\b[^>]*\ssrc=["']([^"']+)["'][^>]*>/i);

  return match?.[1] ? decodeXml(match[1]) : null;
}

function isLikelyImageUrl(value: string) {
  try {
    const url = new URL(value);
    const pathname = url.pathname.toLowerCase();

    return (
      /\.(avif|gif|jpe?g|png|webp)(?:$|\?)/.test(pathname) ||
      pathname.includes("/image") ||
      pathname.includes("/images") ||
      pathname.includes("/media") ||
      url.searchParams.has("url")
    );
  } catch {
    return false;
  }
}

function normalizeFeedLink(value: string | null) {
  const trimmed = value?.trim();

  if (!trimmed || trimmed.includes("\n")) {
    return null;
  }

  try {
    return new URL(trimmed).toString();
  } catch {
    return null;
  }
}

function normalizeTextValue(value: string | null) {
  const normalized = stripHtml(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

  return normalized ? normalized.slice(0, 500) : null;
}

function stripHtml(value: string) {
  return decodeXml(value.replace(/<[^>]*>/g, " "));
}

function stripCdata(value: string) {
  return value.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "");
}

function decodeXml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCharCode(Number.parseInt(code, 16)));
}

function parseFeedDate(value: string | null) {
  if (!value) {
    return null;
  }

  const time = new Date(value).getTime();

  if (!Number.isFinite(time)) {
    return null;
  }

  return new Date(time).toISOString().slice(0, 10);
}

function isWithinLookback(date: string, runDate: string, lookbackDays: number) {
  const runTime = new Date(`${runDate}T00:00:00.000Z`).getTime();
  const valueTime = new Date(`${date}T00:00:00.000Z`).getTime();

  if (!Number.isFinite(runTime) || !Number.isFinite(valueTime)) {
    return true;
  }

  const distanceDays = Math.floor((runTime - valueTime) / 86_400_000);

  return distanceDays >= -1 && distanceDays <= lookbackDays;
}

function getReleaseEventDate({
  text,
  runDate,
  publishedDate,
  releaseKind
}: {
  text: string;
  runDate: string;
  publishedDate: string | null;
  releaseKind?: string | null;
}) {
  if (!isProjectReleaseKind(releaseKind)) {
    return null;
  }

  const inferredDate = extractExplicitReleaseDate(text, publishedDate ?? runDate);

  if (!inferredDate) {
    return null;
  }

  const runTime = getDateTime(runDate);
  const inferredTime = getDateTime(inferredDate);
  const publishedTime = getDateTime(publishedDate);

  if (!Number.isFinite(runTime) || !Number.isFinite(inferredTime)) {
    return null;
  }

  const daysFromRun = Math.round((inferredTime - runTime) / 86_400_000);
  const daysAfterPublished = Number.isFinite(publishedTime)
    ? Math.round((inferredTime - publishedTime) / 86_400_000)
    : 0;

  if (daysFromRun < -30 || daysFromRun > 30 || daysAfterPublished < -2 || daysAfterPublished > 90) {
    return null;
  }

  return inferredDate;
}

function extractExplicitReleaseDate(text: string, referenceDate: string) {
  const monthPattern = Object.keys(MONTH_NUMBERS).join("|");
  const directMatch = text.match(
    new RegExp(`\\b(${monthPattern})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,\\s*(\\d{4}))?\\b`, "i")
  );

  if (directMatch?.[1] && directMatch[2]) {
    const month = MONTH_NUMBERS[directMatch[1].toLowerCase()];
    const day = Number.parseInt(directMatch[2], 10);
    const year = directMatch[3] ? Number.parseInt(directMatch[3], 10) : inferReleaseYear(month, referenceDate);

    return formatDateParts(year, month, day);
  }

  const numericMatch = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);

  if (numericMatch?.[1] && numericMatch[2]) {
    const month = Number.parseInt(numericMatch[1], 10);
    const day = Number.parseInt(numericMatch[2], 10);
    const year = numericMatch[3]
      ? normalizeYear(Number.parseInt(numericMatch[3], 10))
      : inferReleaseYear(month, referenceDate);

    return formatDateParts(year, month, day);
  }

  return null;
}

function getInferredReleaseTitle({
  artistName,
  articleTitle,
  text,
  releaseKind
}: {
  artistName: string;
  articleTitle: string;
  text: string;
  releaseKind?: string | null;
}) {
  if (!isProjectReleaseKind(releaseKind)) {
    return null;
  }

  const title = extractProjectTitle(articleTitle) ?? extractProjectTitle(text);

  if (!title) {
    return null;
  }

  return `${artistName} - ${title}`;
}

function extractProjectTitle(value: string) {
  const patterns = [
    /\breturns with new (?:album|project|mixtape|ep)\s+["']?([^"'.,:;!?]+)["']?/i,
    /\bannounces new (?:album|project|mixtape|ep)\s+["']?([^"'.,:;!?]+)["']?/i,
    /\bshares new (?:album|project|mixtape|ep)\s+["']?([^"'.,:;!?]+)["']?/i,
    /\breleases new (?:album|project|mixtape|ep)\s+["']?([^"'.,:;!?]+)["']?/i,
    /\bdrops new (?:album|project|mixtape|ep)\s+["']?([^"'.,:;!?]+)["']?/i,
    /\bnew (?:album|project|mixtape|ep)\s+["']?([^"'.,:;!?]+)["']?/i,
    /\b(?:album|project|mixtape|ep)(?:,?\s+titled|\s+called)\s+["']?([^"'.,:;!?]+)["']?/i,
    /\btitled\s+["']([^"']+)["']/i
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);
    const candidate = match?.[1] ? cleanProjectTitle(match[1]) : null;

    if (candidate) {
      return candidate;
    }
  }

  return null;
}

function cleanProjectTitle(value: string) {
  const cleaned = value
    .replace(/\s+\b(?:arrives|arrive|coming|due|drops|out|on|via|through|from|featuring|with|will)\b[\s\S]*$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned || cleaned.length < 2 || cleaned.length > 80) {
    return null;
  }

  return cleaned;
}

function isProjectReleaseKind(value: string | null | undefined) {
  return value === "album" || value === "ep" || value === "mixtape";
}

function inferReleaseYear(month: number, referenceDate: string) {
  const reference = new Date(`${referenceDate}T00:00:00.000Z`);
  const referenceYear = Number.isFinite(reference.getTime()) ? reference.getUTCFullYear() : new Date().getUTCFullYear();
  const referenceMonth = Number.isFinite(reference.getTime()) ? reference.getUTCMonth() + 1 : month;

  if (month <= 2 && referenceMonth >= 11) {
    return referenceYear + 1;
  }

  if (month >= 11 && referenceMonth <= 2) {
    return referenceYear - 1;
  }

  return referenceYear;
}

function formatDateParts(year: number, month: number, day: number) {
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));

  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

function normalizeYear(value: number) {
  return value < 100 ? 2000 + value : value;
}

function getDateTime(value: string | null | undefined) {
  if (!value) {
    return Number.NaN;
  }

  return new Date(`${value}T00:00:00.000Z`).getTime();
}

function quoteSearchPhrase(value: string) {
  return value.replace(/"/g, "").replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

const MONTH_NUMBERS: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  sept: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12
};
