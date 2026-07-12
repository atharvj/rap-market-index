import { NextResponse } from "next/server";
import { createServiceRoleClient, getSupabaseConfigStatus } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { getPacificMarketDate, shiftMarketDate } from "@/server/market/market-date";
import { getArtistStatusSubtype } from "@/server/market/status-events";
import { loadArtistImageUrls } from "@/server/market/artist-images";
import {
  hasArtistControversySubjectContext,
  hasArtistReleaseSubjectContext,
  isLowValueMarketArticleTitle,
  isUncorroboratedLowTierMarketClaim
} from "@/server/market/artist-event-disambiguation";
import { classifyArticleEvent, normalizeDomain } from "@/server/market/gdelt-source";
import { loadSourcePreviewImageUrls } from "@/server/market/source-preview-images";

export const dynamic = "force-dynamic";

type ArtistRow = Pick<
  Database["public"]["Tables"]["artists"]["Row"],
  | "id"
  | "name"
  | "ticker"
  | "current_price"
  | "daily_change_percent"
  | "hype_score"
  | "last_move_explanation"
  | "updated_at"
>;
type MarketEventRow = Database["public"]["Tables"]["market_events"]["Row"];
type MarketNewsType = Database["public"]["Tables"]["market_events"]["Row"]["event_type"];
type NewsFeedMode = "home" | "news" | "artist";

type MarketNewsItem = {
  id: string;
  artistId: string;
  artistName: string;
  ticker: string;
  eventDate: string;
  eventType: string;
  eventLabel: string | null;
  title: string;
  sourceName: string | null;
  sourceUrl: string | null;
  sourceDomain: string | null;
  sourceIconUrl: string | null;
  thumbnailUrl: string | null;
  mediaUrl: string | null;
  mediaType: string | null;
  mediaLabel: string | null;
  sentimentScore: number;
  impactScore: number;
  confidence: number;
  statusSubtype?: string | null;
  statusSeverity?: string | null;
  createdAt?: string | null;
};

const DEFAULT_LOOKBACK_DAYS = 30;
const MAX_LOOKBACK_DAYS = 365;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const CACHE_HEADERS = { "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=1800" };

export async function GET(request: Request) {
  const config = getSupabaseConfigStatus();

  if (!config.readyForPublicReads) {
    return NextResponse.json({
      ok: true,
      source: "mock",
      news: [],
      eventCount: 0
    }, { headers: CACHE_HEADERS });
  }

  if (!config.serviceRoleConfigured) {
    return NextResponse.json(
      { ok: false, source: "supabase", error: "Market news is temporarily unavailable." },
      { status: 503, headers: CACHE_HEADERS }
    );
  }

  try {
    const url = new URL(request.url);
    const runDate = normalizeDate(url.searchParams.get("runDate")) ?? getPacificMarketDate();
    const lookbackDays = getInteger(url.searchParams.get("lookbackDays"), DEFAULT_LOOKBACK_DAYS, 1, MAX_LOOKBACK_DAYS);
    const limit = getInteger(url.searchParams.get("limit"), DEFAULT_LIMIT, 1, MAX_LIMIT);
    const artistId = url.searchParams.get("artistId");
    const requestedArtistIds = normalizeArtistIds(url.searchParams.get("artistIds"));
    const ticker = url.searchParams.get("ticker")?.toUpperCase() ?? null;
    const eventType = normalizeEventType(url.searchParams.get("eventType"));
    const feedMode = normalizeFeedMode(url.searchParams.get("feed"));
    const supabase = createServiceRoleClient();
    const artists = await loadArtists(supabase);
    const artistById = new Map(artists.map((artist) => [artist.id, artist]));
    const imageByArtistId = await loadArtistImageUrls(
      supabase,
      artists.map((artist) => artist.id),
      Object.fromEntries(artists.map((artist) => [artist.id, artist.name]))
    );
    const selectedArtistId = artistId ?? (ticker ? artists.find((artist) => artist.ticker === ticker)?.id ?? null : null);
    const selectedArtistIds = selectedArtistId
      ? [selectedArtistId]
      : requestedArtistIds.filter((candidate) => artistById.has(candidate));

    if (ticker && !selectedArtistId) {
      return NextResponse.json({
        ok: true,
        source: "supabase",
        runDate,
        lookbackDays,
        eventCount: 0,
        news: []
      }, { headers: CACHE_HEADERS });
    }

    const candidateLimit = Math.min(500, limit * 6);
    let query = supabase
      .from("market_events")
      .select("*")
      .gte("event_date", shiftMarketDate(runDate, -lookbackDays))
      .lte("event_date", runDate)
      .order("event_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(candidateLimit);

    if (selectedArtistIds.length === 1) {
      query = query.eq("artist_id", selectedArtistIds[0]);
    } else if (selectedArtistIds.length > 1) {
      query = query.in("artist_id", selectedArtistIds);
    }

    if (eventType) {
      query = query.eq("event_type", eventType);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Could not load market news: ${error.message}`);
    }

    const rankedEvents = ((data ?? []) as MarketEventRow[])
      .filter(
        (event) =>
          artistById.has(event.artist_id) &&
          isPublicMarketNewsEvent(event, {
            feedMode: selectedArtistIds.length ? "artist" : feedMode,
            artist: artistById.get(event.artist_id) ?? null
          })
      )
      .sort((first, second) => getNewsImportanceScore(second, runDate) - getNewsImportanceScore(first, runDate));
    const eventNews = diversifyMarketNewsEvents(rankedEvents, {
      feedMode: selectedArtistIds.length ? "artist" : feedMode,
      limit
    }).map((event) => mapMarketEventToNewsItem(event, artistById));
    const sourcePreviewImages = await loadSourcePreviewImageUrls(
      eventNews.filter((item) => !item.thumbnailUrl).map((item) => item.sourceUrl)
    );
    const news = eventNews.slice(0, limit).map((item) => ({
      ...item,
      thumbnailUrl:
        item.thumbnailUrl ??
        (item.sourceUrl ? sourcePreviewImages.get(item.sourceUrl) : null) ??
        imageByArtistId.get(item.artistId) ??
        null
    }));

    return NextResponse.json({
      ok: true,
      source: "supabase",
      runDate,
      lookbackDays,
      eventCount: news.length,
      news
    }, { headers: CACHE_HEADERS });
  } catch (error) {
    console.error("Market news request failed", error);
    return NextResponse.json(
      {
        ok: false,
        source: "supabase",
        error: "Market news is temporarily unavailable."
      },
      { status: 500, headers: CACHE_HEADERS }
    );
  }
}

async function loadArtists(supabase: ReturnType<typeof createServiceRoleClient>) {
  const { data, error } = await supabase
    .from("artists")
    .select("id,name,ticker,current_price,daily_change_percent,hype_score,last_move_explanation,updated_at")
    .eq("is_active", true);

  if (error) {
    throw new Error(`Could not load artists for market news: ${error.message}`);
  }

  return (data ?? []) as ArtistRow[];
}

function mapMarketEventToNewsItem(
  event: MarketEventRow,
  artistById: Map<string, ArtistRow>
): MarketNewsItem {
  const artist = artistById.get(event.artist_id) ?? null;
  const rawPayload = toRawPayload(event.raw_payload);
  const sourceUrl = event.source_url && isSafeHttpUrl(event.source_url) ? event.source_url : null;
  const sourceName = event.source_name ?? null;
  const sourceDomain = getSourceDomain(sourceUrl, sourceName);

  return {
    id: event.id,
    artistId: event.artist_id,
    artistName: artist?.name ?? event.artist_id,
    ticker: artist?.ticker ?? event.artist_id,
    eventDate: event.event_date,
    eventType: event.event_type,
    eventLabel: getPublicEventLabel(event, rawPayload, artist?.name ?? null),
    title: event.title,
    sourceName,
    sourceUrl,
    sourceDomain,
    sourceIconUrl: getSourceIconUrl(sourceDomain, sourceName),
    thumbnailUrl: getEventThumbnailUrl(rawPayload) ?? null,
    mediaUrl: getSupportingMediaUrl(rawPayload),
    mediaType: getSupportingMediaType(rawPayload),
    mediaLabel: getSupportingMediaLabel(rawPayload),
    sentimentScore: Number(event.sentiment_score),
    impactScore: Number(event.impact_score),
    confidence: Number(event.confidence),
    statusSubtype: getArtistStatusSubtype(rawPayload.statusSubtype),
    statusSeverity: typeof rawPayload.statusSeverity === "string" ? rawPayload.statusSeverity : null,
    createdAt: event.created_at
  };
}

function normalizeEventType(value: string | null): MarketNewsType | null {
  if (
    value === "release" ||
    value === "review" ||
    value === "news" ||
    value === "controversy" ||
    value === "award" ||
    value === "tour" ||
    value === "viral"
  ) {
    return value;
  }

  return null;
}

function normalizeFeedMode(value: string | null): NewsFeedMode {
  return value === "home" || value === "artist" ? value : "news";
}

function normalizeArtistIds(value: string | null) {
  if (!value) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .split(",")
        .map((candidate) => candidate.trim())
        .filter((candidate) => /^[a-z0-9][a-z0-9-]{0,79}$/i.test(candidate))
    )
  ).slice(0, 12);
}

function normalizeDate(value: string | null) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function getInteger(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(value ?? "", 10);

  if (!Number.isInteger(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

function isPublicMarketNewsEvent(
  event: MarketEventRow,
  {
    feedMode,
    artist
  }: {
    feedMode: NewsFeedMode;
    artist: ArtistRow | null;
  }
) {
  const rawPayload = toRawPayload(event.raw_payload);
  const source = getRawString(rawPayload.source);
  const title = event.title.toLowerCase();
  const impactScore = Number(event.impact_score);
  const confidence = Number(event.confidence);
  const hasStatusSubtype = Boolean(getArtistStatusSubtype(rawPayload.statusSubtype));

  if (!Number.isFinite(impactScore) || !Number.isFinite(confidence)) {
    return false;
  }

  if (hasHighRiskEvidenceFlags(rawPayload)) {
    return false;
  }

  if (
    (source === "media_rss_item" || source === "gdelt_article") &&
    !isStoredMediaEventStillValid(event, rawPayload, artist)
  ) {
    return false;
  }

  if (hasStatusSubtype) {
    return impactScore >= 18 && confidence >= 0.45;
  }

  if (title.includes("reaction on social") && !isPublicSocialCatalystEvent(event, rawPayload, impactScore, confidence)) {
    return false;
  }

  if (source === "bluesky_post") {
    return false;
  }

  if (source === "reddit_post") {
    if (isPublicSocialCatalystEvent(event, rawPayload, impactScore, confidence)) {
      return true;
    }

    return impactScore >= 45 && confidence >= 0.7 && !isLowSignalSocialTitle(title);
  }

  if (source === "youtube_upload_event") {
    return isPublicYoutubeUploadEvent(event, rawPayload, title, impactScore, confidence, feedMode);
  }

  if (source === "musicbrainz_release_group") {
    return (
      rawPayload.corroborated === true &&
      event.event_type === "release" &&
      impactScore >= 25 &&
      confidence >= 0.55
    );
  }

  if (source === "ai_research_event") {
    return isPublicAiResearchEvent(event, rawPayload, title, impactScore, confidence);
  }

  if (source === "gdelt_article" || source === "media_rss_item") {
    return (
      impactScore >= 22 &&
      confidence >= 0.55 &&
      !isLowSignalSocialTitle(title) &&
      !isLowValueArticleTitle(title)
    );
  }

  if (source === "manual_event") {
    return impactScore >= 18 && confidence >= 0.45;
  }

  return impactScore >= 35 && confidence >= 0.65 && !isLowSignalSocialTitle(title);
}

function isStoredMediaEventStillValid(
  event: MarketEventRow,
  rawPayload: Record<string, unknown>,
  artist: ArtistRow | null
) {
  if (!artist || isLowValueMarketArticleTitle(event.title)) {
    return false;
  }

  const domain =
    getRawString(rawPayload.domain) ||
    normalizeDomain(undefined, event.source_url ?? undefined) ||
    "";
  const classification = classifyArticleEvent(event.title, domain, undefined, {
    allowLowTierRelease: true
  });
  const storedReason = getRawString(rawPayload.classificationReason);
  const sourceTier = getRawNumber(rawPayload.sourceTier) ?? 0;
  const corroboratingSourceCount = getRawNumber(rawPayload.corroboratingSourceCount) ?? 0;
  const artistRole = getRawString(rawPayload.artistRole);
  const isFeatureCredit =
    artistRole === "featured" || titleCreditsArtistAsFeature(event.title, artist.name);

  if (
    isFeatureCredit &&
    !getRawBoolean(rawPayload.musicDemandConfirmed) &&
    !getRawBoolean(rawPayload.publicReactionConfirmed)
  ) {
    return false;
  }

  if (
    !classification ||
    classification.eventType !== event.event_type ||
    (storedReason && classification.reason !== storedReason)
  ) {
    return false;
  }

  if (
    isUncorroboratedLowTierMarketClaim({
      sourceTier,
      classificationReason: classification.reason,
      corroborated: rawPayload.corroborated === true,
      corroboratingSourceCount
    })
  ) {
    return false;
  }

  const query = getRawString(rawPayload.searchQuery) ?? undefined;

  if (classification.reason === "release_terms") {
    return hasArtistReleaseSubjectContext({
      artistName: artist.name,
      text: event.title,
      query
    });
  }

  if (classification.reason === "controversy_terms") {
    return hasArtistControversySubjectContext({
      artistName: artist.name,
      text: event.title,
      query
    });
  }

  return true;
}

function isPublicSocialCatalystEvent(
  event: MarketEventRow,
  rawPayload: Record<string, unknown>,
  impactScore: number,
  confidence: number
) {
  const catalystKind = getRawString(rawPayload.socialCatalystKind);
  const engagement = getRawNumber(rawPayload.engagement);
  const viralityTier = getRawString(rawPayload.viralityTier);
  const isMeaningfulCatalyst =
    catalystKind === "conflict" ||
    catalystKind === "backlash" ||
    catalystKind === "late_reception" ||
    catalystKind === "critic_reaction" ||
    event.event_type === "controversy";
  const hasEnoughPublicSignal =
    viralityTier === "notable" ||
    viralityTier === "major" ||
    viralityTier === "breakout" ||
    Math.abs(impactScore) >= 34 ||
    (typeof engagement === "number" && engagement >= 30);

  return isMeaningfulCatalyst && hasEnoughPublicSignal && Math.abs(impactScore) >= 24 && confidence >= 0.52;
}

function isPublicAiResearchEvent(
  event: MarketEventRow,
  rawPayload: Record<string, unknown>,
  title: string,
  impactScore: number,
  confidence: number
) {
  const evidenceLevel = getRawString(rawPayload.evidenceLevel);
  const sourceType = getRawString(rawPayload.sourceType);
  const sourceTier = getRawNumber(rawPayload.sourceTier) ?? 0;
  const sourceWasFoundBySearch = rawPayload.sourceWasFoundBySearch === true;
  const sourceUrl = event.source_url ?? (getRawText(rawPayload.sourceUrl) || getRawText(rawPayload.url));
  const corroboratingSourceCount = getRawNumber(rawPayload.corroboratingSourceCount) ?? 1;
  const publicReactionConfirmed = getRawBoolean(rawPayload.publicReactionConfirmed);
  const musicDemandConfirmed = getRawBoolean(rawPayload.musicDemandConfirmed);
  const factualClaimConfirmed = getRawBoolean(rawPayload.factualClaimConfirmed);
  const artistRole = getRawString(rawPayload.artistRole);

  if (artistRole === "mentioned") {
    return false;
  }

  if (artistRole === "featured" && !musicDemandConfirmed && !publicReactionConfirmed) {
    return false;
  }

  if (
    evidenceLevel === "low_signal" ||
    evidenceLevel === "rumor" ||
    hasHighRiskEvidenceFlags(rawPayload) ||
    isLowSignalSocialTitle(title) ||
    isLowValueArticleTitle(title)
  ) {
    return false;
  }

  if (!sourceUrl || !isSafeHttpUrl(sourceUrl)) {
    return false;
  }

  if (sourceType === "social" || sourceType === "community") {
    return (
      sourceWasFoundBySearch &&
      factualClaimConfirmed &&
      (publicReactionConfirmed || corroboratingSourceCount >= 2) &&
      Math.abs(impactScore) >= 36 &&
      confidence >= 0.76
    );
  }

  if (sourceTier <= 0) {
    return sourceWasFoundBySearch && Math.abs(impactScore) >= 36 && confidence >= 0.68;
  }

  return Math.abs(impactScore) >= 22 && confidence >= 0.58;
}

function getPublicEventLabel(
  event: MarketEventRow,
  rawPayload: Record<string, unknown>,
  artistName: string | null
) {
  const artistRole = getRawString(rawPayload.artistRole);

  if (artistRole === "featured" || (artistName && titleCreditsArtistAsFeature(event.title, artistName))) {
    return "Feature";
  }

  return null;
}

function titleCreditsArtistAsFeature(title: string, artistName: string) {
  const escapedArtist = escapeRegExp(artistName).replace(/\s+/g, "\\s+");
  const pattern = new RegExp(
    `(?:featuring|feat\\.?|ft\\.?|with|assisted by|alongside)[^,:;|]{0,42}\\b${escapedArtist}\\b`,
    "i"
  );

  return pattern.test(title);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getNewsImportanceScore(event: MarketEventRow, runDate: string) {
  const impactScore = Math.abs(Number(event.impact_score));
  const confidence = Number(event.confidence);
  const ageDays = Math.max(0, daysBetween(event.event_date, runDate));
  const recency = Math.max(0, 28 - ageDays) * 1.85;
  const rawPayload = toRawPayload(event.raw_payload);
  const source = getRawString(rawPayload.source);
  const sourceWeight = getSourceWeight(source);
  const reachScore = source === "youtube_upload_event" ? getYoutubeNewsReachScore(rawPayload) : 0;
  const typeWeight: Record<MarketNewsType, number> = {
    release: 16,
    review: 13,
    news: 8,
    controversy: 18,
    award: 7,
    tour: 6,
    viral: 12
  };

  return impactScore * 1.15 + confidence * 36 + recency + sourceWeight + reachScore + (typeWeight[event.event_type] ?? 0);
}

function getSourceWeight(source: string) {
  if (source === "manual_event") {
    return 18;
  }

  if (source === "gdelt_article" || source === "media_rss_item") {
    return 14;
  }

  if (source === "ai_research_event") {
    return 24;
  }

  if (source === "reddit_post") {
    return 10;
  }

  if (source === "musicbrainz_release_group") {
    return 8;
  }

  if (source === "bluesky_post") {
    return -12;
  }

  if (source === "youtube_upload_event") {
    return -18;
  }

  return 0;
}

function diversifyMarketNewsEvents(events: MarketEventRow[], options: { feedMode: NewsFeedMode; limit: number }) {
  const selected: MarketEventRow[] = [];
  const sourceCounts = new Map<string, number>();
  const artistCounts = new Map<string, number>();
  const seenHeadlineKeys = new Set<string>();
  const youtubeCap = getYoutubeCap(options.feedMode, options.limit);
  const perArtistCap = options.feedMode === "artist" ? options.limit : Math.max(1, Math.ceil(options.limit * 0.22));

  for (const event of events) {
    if (selected.length >= options.limit) {
      break;
    }

    const source = getRawString(toRawPayload(event.raw_payload).source) || "unknown";
    const sourceCount = sourceCounts.get(source) ?? 0;
    const artistCount = artistCounts.get(event.artist_id) ?? 0;
    const headlineKey = getNewsHeadlineKey(event);

    if (source === "youtube_upload_event" && sourceCount >= youtubeCap) {
      continue;
    }

    if (artistCount >= perArtistCap) {
      continue;
    }

    if (seenHeadlineKeys.has(headlineKey)) {
      continue;
    }

    if (isNearDuplicateStory(event, selected)) {
      continue;
    }

    selected.push(event);
    seenHeadlineKeys.add(headlineKey);
    sourceCounts.set(source, sourceCount + 1);
    artistCounts.set(event.artist_id, artistCount + 1);
  }

  return selected;
}

function isNearDuplicateStory(candidate: MarketEventRow, selected: MarketEventRow[]) {
  const candidateTokens = getDistinctiveHeadlineTokens(candidate.title);

  if (candidateTokens.size < 2) {
    return false;
  }

  return selected.some((existing) => {
    if (existing.artist_id !== candidate.artist_id || existing.event_type !== candidate.event_type) {
      return false;
    }

    const candidateDate = Date.parse(`${candidate.event_date}T00:00:00Z`);
    const existingDate = Date.parse(`${existing.event_date}T00:00:00Z`);

    if (!Number.isFinite(candidateDate) || !Number.isFinite(existingDate) || Math.abs(candidateDate - existingDate) > 4 * 86_400_000) {
      return false;
    }

    const existingTokens = getDistinctiveHeadlineTokens(existing.title);
    const shared = [...candidateTokens].filter((token) => existingTokens.has(token)).length;
    const smallerSetSize = Math.min(candidateTokens.size, existingTokens.size);

    return shared >= 4 || (shared >= 3 && shared / Math.max(1, smallerSetSize) >= 0.5);
  });
}

function getDistinctiveHeadlineTokens(value: string) {
  const ignored = new Set([
    "a", "an", "and", "at", "by", "for", "from", "in", "is", "it", "new", "of", "on", "the", "to", "with",
    "official", "audio", "video", "music", "rapper", "rap", "announces", "reveals", "says", "report", "reports"
  ]);

  return new Set(
    normalizeNewsHeadline(value)
      .split(" ")
      .filter((token) => token.length >= 3 && !ignored.has(token) && !/^20\d{2}$/.test(token))
  );
}

function getNewsHeadlineKey(event: MarketEventRow) {
  return `${event.artist_id}:${normalizeNewsHeadline(event.title)}`;
}

function normalizeNewsHeadline(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+-\s+[a-z0-9 .&]+$/i, "")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getYoutubeCap(feedMode: NewsFeedMode, limit: number) {
  if (feedMode === "home") {
    return 1;
  }

  if (feedMode === "artist") {
    return Math.max(1, Math.floor(limit * 0.35));
  }

  return Math.max(2, Math.floor(limit * 0.22));
}

function daysBetween(date: string, runDate: string) {
  const start = Date.parse(`${date}T00:00:00Z`);
  const end = Date.parse(`${runDate}T00:00:00Z`);

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return 0;
  }

  return Math.round((end - start) / 86_400_000);
}

function isPublicYoutubeUploadEvent(
  event: MarketEventRow,
  rawPayload: Record<string, unknown>,
  title: string,
  impactScore: number,
  confidence: number,
  feedMode: NewsFeedMode
) {
  const releaseKind = getRawString(rawPayload.releaseKind);
  const classificationReason = getRawString(rawPayload.classificationReason);
  const qualityMultiplier = getRawNumber(rawPayload.uploadQualityMultiplier) ?? 1;
  const relatedUploadCount = getRawNumber(rawPayload.relatedUploadCount) ?? 0;
  const viewCount =
    getRawNumber(rawPayload.viewCount) ??
    getRawNumber(rawPayload.representativeViewCount) ??
    getRawNumber(rawPayload.clusterMaxViews);
  const clusterTotalViews = getRawNumber(rawPayload.clusterTotalViews) ?? 0;
  const clusterReachRatio = getRawNumber(rawPayload.clusterReachRatio);
  const likeCount = getRawNumber(rawPayload.likeCount) ?? 0;
  const commentCount = getRawNumber(rawPayload.commentCount) ?? 0;
  const hasNamedProject = Boolean(getRawText(rawPayload.inferredReleaseTitle));
  const isProjectCluster = releaseKind === "project" || relatedUploadCount >= 2;
  const isGenericCluster = classificationReason === "official_audio_release_cluster" && !hasNamedProject;
  const hasProjectEvidence =
    hasNamedProject ||
    relatedUploadCount >= 3 ||
    clusterTotalViews >= 120_000 ||
    (typeof clusterReachRatio === "number" && clusterReachRatio >= 0.45);
  const isTitleOnlyProjectGuess = classificationReason === "album_announcement_upload_title" && !hasProjectEvidence;
  const isMusicVideo = title.includes("official video") || title.includes("music video");
  const isTrackAudio = title.includes("official audio") || title.includes("audio");
  const isStandaloneTrackAudio = rawPayload.standaloneTrackAudio === true;
  const isMainFeed = feedMode === "home" || feedMode === "news";
  const isMajorProjectRelease = ["album", "ep", "mixtape"].includes(releaseKind) || hasNamedProject;
  const minimumViews = isMajorProjectRelease || isMusicVideo || isProjectCluster ? 25_000 : isTrackAudio ? 90_000 : 60_000;
  const engagementScore = likeCount * 8 + commentCount * 20;
  const hasStrongEngagement = engagementScore >= 25_000;
  const hasMeaningfulProjectReach =
    isProjectCluster &&
    (hasNamedProject || clusterTotalViews >= 120_000) &&
    ((typeof viewCount === "number" && viewCount >= 25_000) ||
      clusterTotalViews >= 85_000 ||
      (typeof clusterReachRatio === "number" && clusterReachRatio >= 0.45));
  const hasEnoughReach =
    typeof viewCount !== "number"
      ? hasMeaningfulProjectReach
      : viewCount >= minimumViews || clusterTotalViews >= 85_000 || (viewCount >= 15_000 && hasStrongEngagement);

  if (isTitleOnlyProjectGuess) {
    const minimumProjectGuessViews = isMainFeed ? 750_000 : 250_000;

    return (
      typeof viewCount === "number" &&
      viewCount >= minimumProjectGuessViews &&
      !hasLowSignalYoutubeTitle(title) &&
      qualityMultiplier >= 0.9 &&
      impactScore >= (isMainFeed ? 54 : 42) &&
      confidence >= (isMainFeed ? 0.76 : 0.68)
    );
  }

  if (classificationReason === "track_audio_upload_title" || (isTrackAudio && !isProjectCluster && !isMajorProjectRelease)) {
    const mainFeedMinimumViews = 1_000_000;
    const artistFeedMinimumViews = 500_000;

    return (
      isStandaloneTrackAudio &&
      !hasLowSignalYoutubeTitle(title) &&
      typeof viewCount === "number" &&
      viewCount >= (isMainFeed ? mainFeedMinimumViews : artistFeedMinimumViews) &&
      (isMainFeed ? hasStrongEngagement || viewCount >= 2_500_000 : true) &&
      impactScore >= (isMainFeed ? 58 : 48) &&
      confidence >= (isMainFeed ? 0.76 : 0.7)
    );
  }

  if (title.includes("project release cycle")) {
    return false;
  }

  if (hasLowSignalYoutubeTitle(title)) {
    return false;
  }

  if (isGenericCluster && !hasMeaningfulProjectReach) {
    return false;
  }

  if (isMainFeed && isGenericCluster && clusterTotalViews < 350_000) {
    return false;
  }

  if (qualityMultiplier < 0.75 && !isProjectCluster) {
    return false;
  }

  if (!hasEnoughReach) {
    return false;
  }

  if (event.event_type === "release") {
    return impactScore >= (isMainFeed ? 42 : 32) && confidence >= (isMainFeed ? 0.66 : 0.58);
  }

  if (event.event_type === "viral" || event.event_type === "controversy") {
    return impactScore >= 45 && confidence >= 0.7;
  }

  return impactScore >= 35 && confidence >= 0.65;
}

function getYoutubeNewsReachScore(rawPayload: Record<string, unknown>) {
  const viewCount =
    getRawNumber(rawPayload.clusterMaxViews) ??
    getRawNumber(rawPayload.representativeViewCount) ??
    getRawNumber(rawPayload.viewCount) ??
    0;
  const totalViews = getRawNumber(rawPayload.clusterTotalViews) ?? viewCount;
  const reachRatio = getRawNumber(rawPayload.clusterReachRatio) ?? 0;
  const viewLift = viewCount > 0 ? Math.log10(viewCount + 1) * 2.3 : 0;
  const totalLift = totalViews > 0 ? Math.log10(totalViews + 1) * 1.15 : 0;
  const ratioLift = reachRatio > 1 ? Math.min(7, reachRatio * 2.4) : reachRatio > 0 ? reachRatio * 2 : 0;

  return Math.min(18, viewLift + totalLift + ratioLift);
}

function toRawPayload(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function getRawString(value: unknown) {
  return typeof value === "string" ? value.toLowerCase() : "";
}

function getRawText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getRawNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getRawBoolean(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return value.trim().toLowerCase() === "true";
  }

  return false;
}

function getRiskFlags(rawPayload: Record<string, unknown>) {
  const value = rawPayload.riskFlags;

  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string").map((item) => item.toLowerCase());
}

function hasHighRiskEvidenceFlags(rawPayload: Record<string, unknown>) {
  return getRiskFlags(rawPayload).some((flag) =>
    [
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
    ].some((term) => flag.includes(term))
  );
}

function getSupportingMediaUrl(rawPayload: Record<string, unknown>) {
  const url = getRawText(rawPayload.supportingMediaUrl);

  return isSafeHttpUrl(url) ? url : null;
}

function getSupportingMediaType(rawPayload: Record<string, unknown>) {
  const type = getRawString(rawPayload.supportingMediaType);

  if (type === "youtube" || type === "spotify" || type === "other") {
    return type;
  }

  return null;
}

function getSupportingMediaLabel(rawPayload: Record<string, unknown>) {
  const type = getSupportingMediaType(rawPayload);

  if (type === "youtube") {
    return "Watch";
  }

  if (type === "spotify") {
    return "Listen";
  }

  if (type === "other") {
    return "Open";
  }

  return null;
}

function getEventThumbnailUrl(rawPayload: Record<string, unknown>) {
  const directImageUrl = [
    rawPayload.thumbnailUrl,
    rawPayload.thumbnail_url,
    rawPayload.imageUrl,
    rawPayload.image_url,
    rawPayload.urlToImage
  ]
    .map(getRawText)
    .find(isSafeHttpUrl);

  if (directImageUrl) {
    return directImageUrl;
  }

  const videoId = getRawText(rawPayload.videoId);

  if (/^[A-Za-z0-9_-]{6,}$/.test(videoId)) {
    return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  }

  return null;
}

function getSourceDomain(sourceUrl: string | null, sourceName: string | null) {
  const sourceDomain = getDomainFromUrl(sourceUrl);
  const normalizedSource = (sourceName ?? "").trim().toLowerCase();
  const sourceMap: Record<string, string> = {
    billboard: "billboard.com",
    pitchfork: "pitchfork.com",
    "pitchfork.com": "pitchfork.com",
    yahoo: "yahoo.com",
    youtube: "youtube.com",
    reddit: "reddit.com",
    bluesky: "bsky.app",
    musicbrainz: "musicbrainz.org",
    variety: "variety.com",
    complex: "complex.com",
    xxl: "xxlmag.com",
    "hotnewhiphop": "hotnewhiphop.com",
    "hotnewhiphop.com": "hotnewhiphop.com",
    "capital xtra": "capitalxtra.com",
    "rolling stone": "rollingstone.com",
    "rolling stone australia": "au.rollingstone.com",
    forbes: "forbes.com",
    "consequence of sound": "consequence.net",
    hypebeast: "hypebeast.com",
    tmz: "tmz.com",
    genius: "genius.com"
  };

  if (sourceDomain && sourceDomain !== "news.google.com") {
    return sourceDomain;
  }

  if (sourceMap[normalizedSource]) {
    return sourceMap[normalizedSource];
  }

  if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(normalizedSource)) {
    return normalizedSource.replace(/^www\./, "");
  }

  return sourceDomain;
}

function getDomainFromUrl(sourceUrl: string | null) {
  if (!sourceUrl) {
    return null;
  }

  try {
    const hostname = new URL(sourceUrl).hostname.replace(/^www\./, "");

    if (hostname === "news.google.com") {
      return "news.google.com";
    }

    return hostname;
  } catch {
    return null;
  }
}

function getSourceIconUrl(sourceDomain: string | null, sourceName: string | null) {
  if (sourceName === "RMI Market Wire") {
    return "/logo.svg";
  }

  if (!sourceDomain) {
    return null;
  }

  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(sourceDomain)}&sz=64`;
}

function isSafeHttpUrl(value: string | undefined) {
  if (!value) {
    return false;
  }

  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");

    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      url.username ||
      url.password ||
      (url.port && url.port !== "80" && url.port !== "443") ||
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname === "0.0.0.0" ||
      hostname === "::" ||
      hostname === "::1" ||
      hostname.startsWith("127.") ||
      hostname.startsWith("10.") ||
      hostname.startsWith("192.168.") ||
      hostname.startsWith("169.254.") ||
      isPrivate172Address(hostname) ||
      (hostname.includes(":") && /^(?:fc|fd|fe[89ab])/.test(hostname))
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

function isPrivate172Address(hostname: string) {
  const match = hostname.match(/^172\.(\d{1,3})\./);
  const secondOctet = match ? Number(match[1]) : Number.NaN;

  return Number.isInteger(secondOctet) && secondOctet >= 16 && secondOctet <= 31;
}

function isLowSignalSocialTitle(title: string) {
  return (
    title.includes("reaction on social") ||
    title.includes("random") ||
    title.includes("fan reaction") ||
    title.includes("stan") ||
    title.includes("meme")
  );
}

function isLowValueArticleTitle(title: string) {
  return (
    title.includes("explorepage") ||
    title.includes("#fyp") ||
    title.includes("#viral") ||
    title.includes("reaction on social")
  );
}

function hasLowSignalYoutubeTitle(title: string) {
  return (
    title.includes("#explorepage") ||
    title.includes("#fyp") ||
    title.includes("#shorts") ||
    title.includes("explore page") ||
    title.includes("who tf is we") ||
    title.includes("deserves to be on the radio")
  );
}
