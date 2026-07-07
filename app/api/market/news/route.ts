import { NextResponse } from "next/server";
import { createAnonServerClient, getSupabaseConfigStatus } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { getPacificMarketDate, shiftMarketDate } from "@/server/market/market-date";
import { getArtistStatusSubtype } from "@/server/market/status-events";

export const dynamic = "force-dynamic";

type ArtistRow = Pick<
  Database["public"]["Tables"]["artists"]["Row"],
  "id" | "name" | "ticker" | "current_price" | "daily_change_percent" | "hype_score" | "last_move_explanation"
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
  title: string;
  sourceName: string | null;
  sourceUrl: string | null;
  sourceDomain: string | null;
  sourceIconUrl: string | null;
  thumbnailUrl: string | null;
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

export async function GET(request: Request) {
  const config = getSupabaseConfigStatus();

  if (!config.readyForPublicReads) {
    return NextResponse.json({
      ok: true,
      source: "mock",
      news: [],
      eventCount: 0,
      config
    });
  }

  try {
    const url = new URL(request.url);
    const runDate = normalizeDate(url.searchParams.get("runDate")) ?? getPacificMarketDate();
    const lookbackDays = getInteger(url.searchParams.get("lookbackDays"), DEFAULT_LOOKBACK_DAYS, 1, MAX_LOOKBACK_DAYS);
    const limit = getInteger(url.searchParams.get("limit"), DEFAULT_LIMIT, 1, MAX_LIMIT);
    const artistId = url.searchParams.get("artistId");
    const ticker = url.searchParams.get("ticker")?.toUpperCase() ?? null;
    const eventType = normalizeEventType(url.searchParams.get("eventType"));
    const feedMode = normalizeFeedMode(url.searchParams.get("feed"));
    const supabase = createAnonServerClient();
    const artists = await loadArtists(supabase);
    const artistById = new Map(artists.map((artist) => [artist.id, artist]));
    const selectedArtistId = artistId ?? (ticker ? artists.find((artist) => artist.ticker === ticker)?.id ?? null : null);

    if (ticker && !selectedArtistId) {
      return NextResponse.json({
        ok: true,
        source: "supabase",
        runDate,
        lookbackDays,
        eventCount: 0,
        news: []
      });
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

    if (selectedArtistId) {
      query = query.eq("artist_id", selectedArtistId);
    }

    if (eventType) {
      query = query.eq("event_type", eventType);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Could not load market news: ${error.message}`);
    }

    const rankedEvents = ((data ?? []) as MarketEventRow[])
      .filter((event) => artistById.has(event.artist_id) && isPublicMarketNewsEvent(event))
      .sort((first, second) => getNewsImportanceScore(second, runDate) - getNewsImportanceScore(first, runDate));
    const eventNews = diversifyMarketNewsEvents(rankedEvents, {
      feedMode: selectedArtistId ? "artist" : feedMode,
      limit
    }).map((event) => mapMarketEventToNewsItem(event, artistById));
    const news = selectedArtistId
      ? eventNews
      : fillWithMarketPulseNews(eventNews, artists, {
          feedMode,
          limit,
          runDate
        });

    return NextResponse.json({
      ok: true,
      source: "supabase",
      runDate,
      lookbackDays,
      eventCount: news.length,
      news
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        source: "supabase",
        config,
        error: error instanceof Error ? error.message : "Could not load market news."
      },
      { status: 500 }
    );
  }
}

async function loadArtists(supabase: ReturnType<typeof createAnonServerClient>) {
  const { data, error } = await supabase
    .from("artists")
    .select("id,name,ticker,current_price,daily_change_percent,hype_score,last_move_explanation")
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
  const sourceUrl = event.source_url ?? null;
  const sourceName = event.source_name ?? null;
  const sourceDomain = getSourceDomain(sourceUrl, sourceName);

  return {
    id: event.id,
    artistId: event.artist_id,
    artistName: artist?.name ?? event.artist_id,
    ticker: artist?.ticker ?? event.artist_id,
    eventDate: event.event_date,
    eventType: event.event_type,
    title: event.title,
    sourceName,
    sourceUrl,
    sourceDomain,
    sourceIconUrl: getSourceIconUrl(sourceDomain, sourceName),
    thumbnailUrl: getEventThumbnailUrl(rawPayload),
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

function isPublicMarketNewsEvent(event: MarketEventRow) {
  const rawPayload = toRawPayload(event.raw_payload);
  const source = getRawString(rawPayload.source);
  const title = event.title.toLowerCase();
  const impactScore = Number(event.impact_score);
  const confidence = Number(event.confidence);
  const hasStatusSubtype = Boolean(getArtistStatusSubtype(rawPayload.statusSubtype));

  if (!Number.isFinite(impactScore) || !Number.isFinite(confidence)) {
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
    return isPublicYoutubeUploadEvent(event, rawPayload, title, impactScore, confidence);
  }

  if (source === "musicbrainz_release_group") {
    return event.event_type === "release" && impactScore >= 25 && confidence >= 0.55;
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

function getNewsImportanceScore(event: MarketEventRow, runDate: string) {
  const impactScore = Math.abs(Number(event.impact_score));
  const confidence = Number(event.confidence);
  const ageDays = Math.max(0, daysBetween(event.event_date, runDate));
  const recency = Math.max(0, 28 - ageDays) * 1.85;
  const source = getRawString(toRawPayload(event.raw_payload).source);
  const sourceWeight = getSourceWeight(source);
  const typeWeight: Record<MarketNewsType, number> = {
    release: 16,
    review: 13,
    news: 8,
    controversy: 18,
    award: 7,
    tour: 6,
    viral: 12
  };

  return impactScore * 1.15 + confidence * 36 + recency + sourceWeight + (typeWeight[event.event_type] ?? 0);
}

function getSourceWeight(source: string) {
  if (source === "manual_event") {
    return 18;
  }

  if (source === "gdelt_article" || source === "media_rss_item") {
    return 14;
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
  const youtubeCap = getYoutubeCap(options.feedMode, options.limit);
  const perArtistCap = options.feedMode === "artist" ? options.limit : Math.max(1, Math.ceil(options.limit * 0.22));

  for (const event of events) {
    if (selected.length >= options.limit) {
      break;
    }

    const source = getRawString(toRawPayload(event.raw_payload).source) || "unknown";
    const sourceCount = sourceCounts.get(source) ?? 0;
    const artistCount = artistCounts.get(event.artist_id) ?? 0;

    if (source === "youtube_upload_event" && sourceCount >= youtubeCap) {
      continue;
    }

    if (artistCount >= perArtistCap) {
      continue;
    }

    selected.push(event);
    sourceCounts.set(source, sourceCount + 1);
    artistCounts.set(event.artist_id, artistCount + 1);
  }

  return selected;
}

function fillWithMarketPulseNews(
  news: MarketNewsItem[],
  artists: ArtistRow[],
  options: {
    feedMode: NewsFeedMode;
    limit: number;
    runDate: string;
  }
) {
  const minimumRows = getMinimumFeedRows(options.feedMode, options.limit);

  if (news.length >= minimumRows) {
    return news.slice(0, options.limit);
  }

  const targetRows = Math.min(options.limit, minimumRows);
  const existingArtistIds = new Set(news.map((item) => item.artistId));
  const marketPulseItems = artists
    .filter((artist) => !existingArtistIds.has(artist.id))
    .map((artist) => createMarketPulseNewsItem(artist, options.runDate))
    .filter((item): item is MarketNewsItem => Boolean(item))
    .sort((first, second) => second.impactScore - first.impactScore);

  return [...news, ...marketPulseItems].slice(0, targetRows);
}

function getMinimumFeedRows(feedMode: NewsFeedMode, limit: number) {
  if (feedMode === "home") {
    return Math.min(limit, 5);
  }

  if (feedMode === "news") {
    return Math.min(limit, 14);
  }

  return 0;
}

function createMarketPulseNewsItem(artist: ArtistRow, runDate: string): MarketNewsItem | null {
  const dailyChangePercent = Number(artist.daily_change_percent);
  const hypeScore = Number(artist.hype_score);
  const currentPrice = Number(artist.current_price);

  if (!Number.isFinite(dailyChangePercent) || !Number.isFinite(hypeScore) || !Number.isFinite(currentPrice)) {
    return null;
  }

  const absMove = Math.abs(dailyChangePercent);
  const hasMarketMove = absMove >= 0.18;
  const hasStrongScore = hypeScore >= 56;

  if (!hasMarketMove && !hasStrongScore) {
    return null;
  }

  const positive = dailyChangePercent >= 0;
  const sourceName = "RMI Market Wire";
  const moveText = `${positive ? "+" : ""}${dailyChangePercent.toFixed(2)}%`;
  const title = hasMarketMove
    ? `${artist.name} ${positive ? "rises" : "slips"} ${moveText} as RMI market signals ${positive ? "improve" : "cool"}.`
    : `${artist.name} is among the highest-scoring artists on the RMI board.`;

  return {
    id: `market-pulse-${artist.id}-${runDate}`,
    artistId: artist.id,
    artistName: artist.name,
    ticker: artist.ticker,
    eventDate: runDate,
    eventType: "market",
    title,
    sourceName,
    sourceUrl: null,
    sourceDomain: null,
    sourceIconUrl: "/logo.svg",
    thumbnailUrl: null,
    sentimentScore: positive ? 18 : -18,
    impactScore: Math.round(absMove * 12 + hypeScore * 0.75),
    confidence: 0.72,
    statusSubtype: null,
    statusSeverity: null,
    createdAt: null
  };
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
  confidence: number
) {
  const releaseKind = getRawString(rawPayload.releaseKind);
  const classificationReason = getRawString(rawPayload.classificationReason);
  const qualityMultiplier = getRawNumber(rawPayload.uploadQualityMultiplier) ?? 1;
  const relatedUploadCount = getRawNumber(rawPayload.relatedUploadCount) ?? 0;
  const viewCount = getRawNumber(rawPayload.viewCount);
  const likeCount = getRawNumber(rawPayload.likeCount) ?? 0;
  const commentCount = getRawNumber(rawPayload.commentCount) ?? 0;
  const hasNamedProject = Boolean(getRawText(rawPayload.inferredReleaseTitle));
  const isProjectCluster = releaseKind === "project" || relatedUploadCount >= 2;
  const isGenericCluster = classificationReason === "official_audio_release_cluster" && !hasNamedProject;
  const isMusicVideo = title.includes("official video") || title.includes("music video");
  const isTrackAudio = title.includes("official audio") || title.includes("audio");
  const isMajorProjectRelease = ["album", "ep", "mixtape"].includes(releaseKind) || hasNamedProject;
  const minimumViews = isMajorProjectRelease || isMusicVideo ? 25_000 : isTrackAudio ? 90_000 : 60_000;
  const engagementScore = likeCount * 8 + commentCount * 20;
  const hasStrongEngagement = engagementScore >= 25_000;
  const hasEnoughReach =
    typeof viewCount !== "number"
      ? isMajorProjectRelease
      : viewCount >= minimumViews || (viewCount >= 15_000 && hasStrongEngagement);

  if (isGenericCluster || title.includes("project release cycle")) {
    return false;
  }

  if (hasLowSignalYoutubeTitle(title)) {
    return false;
  }

  if (qualityMultiplier < 0.75 && !isProjectCluster) {
    return false;
  }

  if (!hasEnoughReach) {
    return false;
  }

  if (event.event_type === "release") {
    return impactScore >= 32 && confidence >= 0.58;
  }

  if (event.event_type === "viral" || event.event_type === "controversy") {
    return impactScore >= 45 && confidence >= 0.7;
  }

  return impactScore >= 35 && confidence >= 0.65;
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

  if (sourceDomain) {
    return sourceDomain;
  }

  const normalizedSource = (sourceName ?? "").trim().toLowerCase();
  const sourceMap: Record<string, string> = {
    billboard: "billboard.com",
    pitchfork: "pitchfork.com",
    "pitchfork.com": "pitchfork.com",
    yahoo: "yahoo.com",
    youtube: "youtube.com",
    reddit: "reddit.com",
    bluesky: "bsky.app",
    musicbrainz: "musicbrainz.org"
  };

  if (sourceMap[normalizedSource]) {
    return sourceMap[normalizedSource];
  }

  if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(normalizedSource)) {
    return normalizedSource.replace(/^www\./, "");
  }

  return null;
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
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
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
