import { VERIFIED_SPOTIFY_ARTISTS } from "@/data/spotifyArtistIds";
import { applyTrackingExternalIds } from "@/server/market/artist-tracking";
import { priceForTrendAnalysis, readAudienceRevaluation, type AudienceRevaluation } from "@/server/market/audience-revaluation";
import { loadAllPages } from "@/lib/pagination";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import type {
  ArtistMarketUpdate,
  MarketUpdateArtist,
  MarketUpdateSummary,
  PriceTrendContext
} from "@/server/market/daily-update";
import type {
  ArtistExternalIds,
  MarketEvent,
  MarketObservation,
  ObservationBaselines
} from "@/server/market/market-data";
import type { ArtistCategory, HypeStats } from "@/lib/types";
import { isMarketEventSourceIntegrityValid } from "@/server/market/event-integrity";
import { shouldRecordIntradayPriceTick } from "@/server/market/intraday-refresh";
import { decodeHtmlEntities } from "@/lib/html-entities";
import { mergeSameDayAppleSnapshots } from "@/server/market/apple-chart-snapshot";

type Supabase = SupabaseClient<Database>;

type ArtistRow = Database["public"]["Tables"]["artists"]["Row"];
type ArtistExternalIdsRow = Database["public"]["Tables"]["artist_external_ids"]["Row"];
type ArtistStatsRow = Database["public"]["Tables"]["artist_stats"]["Row"];
type MarketEventRow = Database["public"]["Tables"]["market_events"]["Row"];
type MarketObservationRow = Database["public"]["Tables"]["market_observations"]["Row"];

export type ArtistExternalIdUpsert = {
  artistId: string;
  spotifyId?: string | null;
  youtubeChannelId?: string | null;
  musicbrainzId?: string | null;
  wikipediaArticleTitle?: string | null;
  lastfmName?: string | null;
  gdeltQuery?: string | null;
};

export async function loadActiveArtists(supabase: Supabase): Promise<MarketUpdateArtist[]> {
  const { data, error } = await supabase
    .from("artists")
    .select("*")
    .eq("is_active", true)
    .order("ticker", { ascending: true });

  if (error) {
    throw new Error(`Could not load artists: ${error.message}`);
  }

  return mapArtistRowsWithStats(supabase, (data ?? []) as ArtistRow[]);
}

export async function loadActiveArtistCount(supabase: Supabase) {
  const { count, error } = await supabase
    .from("artists")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true);

  if (error) {
    throw new Error(`Could not count active artists: ${error.message}`);
  }

  return count ?? 0;
}

export async function loadActiveArtistsPage({
  supabase,
  offset,
  limit
}: {
  supabase: Supabase;
  offset: number;
  limit: number;
}): Promise<MarketUpdateArtist[]> {
  const { data, error } = await supabase
    .from("artists")
    .select("*")
    .eq("is_active", true)
    .order("ticker", { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) {
    throw new Error(`Could not load artist batch: ${error.message}`);
  }

  return mapArtistRowsWithStats(supabase, (data ?? []) as ArtistRow[]);
}

async function mapArtistRowsWithStats(supabase: Supabase, artistRows: ArtistRow[]) {
  const statsByArtist = await loadStatsByArtist(
    supabase,
    artistRows.map((row) => row.id)
  );

  return artistRows.map((row) => ({
    id: row.id,
    name: row.name,
    ticker: row.ticker,
    currentPrice: Number(row.current_price),
    previousClose: Number(row.previous_close),
    previousCloseSource: "artist" as const,
    hypeScore: row.hype_score,
    volatility: Number(row.volatility),
    category: row.category as ArtistCategory,
    stats: mapStats(statsByArtist[row.id] ?? null)
  }));
}

export async function loadPreviousClosePrices({
  supabase,
  artistIds,
  runDate
}: {
  supabase: Supabase;
  artistIds: string[];
  runDate: string;
}) {
  if (!artistIds.length) {
    return {};
  }

  const previousCloses: Record<string, number> = {};
  let missing = [...new Set(artistIds)];
  // A backend page can contain hundreds of closes for one artist. Re-query
  // unresolved artists rather than silently losing their older latest close.
  while (missing.length) {
    const { data, error } = await supabase.from("price_history")
      .select("artist_id,price,price_date").in("artist_id", missing).lt("price_date", runDate)
      .order("price_date", { ascending: false }).order("artist_id").range(0, 999);
    if (error) throw new Error(`Could not load previous closes: ${error.message}`);
    for (const row of data ?? []) {
      if (previousCloses[row.artist_id] === undefined) previousCloses[row.artist_id] = Number(row.price);
    }
    const unresolved = missing.filter(id => previousCloses[id] === undefined);
    if (unresolved.length === missing.length || (data ?? []).length < 1000) break;
    missing = unresolved;
  }
  return previousCloses;
}

export async function loadExistingPriceHistoryArtistIds({
  supabase,
  artistIds,
  runDate
}: {
  supabase: Supabase;
  artistIds: string[];
  runDate: string;
}) {
  if (!artistIds.length) {
    return new Set<string>();
  }

  const { data, error } = await supabase
    .from("price_history")
    .select("artist_id")
    .in("artist_id", artistIds)
    .eq("price_date", runDate);

  if (error) {
    throw new Error(`Could not inspect current-day price history: ${error.message}`);
  }

  return new Set((data ?? []).map((row) => row.artist_id));
}

export async function loadPreviousSignalStats({
  supabase,
  artistIds,
  runDate
}: {
  supabase: Supabase;
  artistIds: string[];
  runDate: string;
}): Promise<Record<string, HypeStats & { previousEventPricing?: unknown; previousReceptionBaseline?: Record<string, number> }>> {
  if (!artistIds.length) {
    return {};
  }

  const result: Record<string, HypeStats & { previousEventPricing?: unknown; previousReceptionBaseline?: Record<string, number> }> = {};
  // Query unresolved artists again: a busy artist must not crowd an older
  // artist's baseline out of PostgREST's first 1,000 rows.
  let pending = [...new Set(artistIds)];
  while (pending.length) {
    const { data, error } = await supabase.from("market_signal_snapshots")
      .select("artist_id,source_date,streaming_growth,youtube_growth,search_growth,social_growth,news_score,trader_demand,event_pricing:raw_payload->market_events,source_values:raw_payload->sourceValues,reception_pricing:raw_payload->receptionPricingBaseline,comment_reception:raw_payload->youtube_comments")
      .in("artist_id", pending).lt("source_date", runDate)
      .order("source_date", { ascending: false }).order("artist_id").limit(1000);
    if (error) throw new Error(`Could not load previous signal snapshots: ${error.message}`);
    for (const row of data ?? []) {
      if (result[row.artist_id]) continue;
      result[row.artist_id] = {
        streamingGrowth: Number(row.streaming_growth), youtubeGrowth: Number(row.youtube_growth),
        searchGrowth: Number(row.search_growth), socialGrowth: Number(row.social_growth),
        newsScore: Number(row.news_score), traderDemand: Number(row.trader_demand),
        previousEventPricing: row.event_pricing,
        previousReceptionBaseline: readReceptionBaseline(row.reception_pricing, row.source_values, row.comment_reception)
      };
    }
    const remaining = pending.filter(id => !result[id]);
    if ((data ?? []).length < 1000) break;
    if (remaining.length === pending.length) throw new Error("Could not resolve previous signal snapshots completely.");
    pending = remaining;
  }
  return result;
}

function readReceptionBaseline(saved: unknown, legacy: unknown, commentReception?: unknown) {
  const record = saved && typeof saved === "object" ? saved as Record<string, unknown> : {};
  const values = legacy && typeof legacy === "object" ? legacy as Record<string, unknown> : {};
  const result: Record<string, number> = {};
  for (const source of ["youtube_comments", "bluesky"]) {
    const entry = values[source] as Record<string, unknown> | undefined;
    const value = record[source] ?? entry?.socialGrowth;
    if (typeof value === "number" && Number.isFinite(value)) result[source] = value;
  }
  const comments = commentReception && typeof commentReception === "object" ? commentReception as Record<string, unknown> : {};
  if (typeof record.youtube_comments_v2 === "number" && Number.isFinite(record.youtube_comments_v2)) result.youtube_comments_v2 = record.youtube_comments_v2;
  else if (typeof comments.sentimentAverage === "number" && Number.isFinite(comments.sentimentAverage) &&
    typeof comments.netShare === "number" && Number.isFinite(comments.netShare) && typeof result.youtube_comments === "number") {
    result.youtube_comments_v2 = Math.max(-45, Math.min(45, comments.sentimentAverage * 0.34 + comments.netShare * 0.2));
  }
  return result;
}

export async function loadCurrentSignalStats({
  supabase,
  artistIds,
  runDate
}: {
  supabase: Supabase;
  artistIds: string[];
  runDate: string;
}): Promise<Record<string, HypeStats>> {
  if (!artistIds.length) {
    return {};
  }

  const { data, error } = await supabase
    .from("market_signal_snapshots")
    .select("artist_id,streaming_growth,youtube_growth,search_growth,social_growth,news_score,trader_demand")
    .in("artist_id", artistIds)
    .eq("source_date", runDate);

  if (error) {
    throw new Error(`Could not load current signal snapshots: ${error.message}`);
  }

  return Object.fromEntries(
    (data ?? []).map((row) => [
      row.artist_id,
      {
        streamingGrowth: Number(row.streaming_growth),
        youtubeGrowth: Number(row.youtube_growth),
        searchGrowth: Number(row.search_growth),
        socialGrowth: Number(row.social_growth),
        newsScore: Number(row.news_score),
        traderDemand: Number(row.trader_demand)
      }
    ])
  );
}

export async function loadPriceTrendContexts({
  supabase,
  artistIds,
  runDate,
  lookbackDays = 35
}: {
  supabase: Supabase;
  artistIds: string[];
  runDate: string;
  lookbackDays?: number;
}): Promise<Record<string, PriceTrendContext>> {
  if (!artistIds.length) {
    return {};
  }

  const startDate = shiftDate(runDate, -lookbackDays);
  const [data, boundaries] = await Promise.all([
    loadAllPages(async (from, to) => {
      const result = await supabase.from("price_history").select("artist_id,price,price_date")
        .in("artist_id", artistIds).gte("price_date", startDate).lt("price_date", runDate)
        .order("price_date").order("artist_id").range(from, to);
      if (result.error) throw new Error(`Could not load price trend contexts: ${result.error.message}`);
      return result.data ?? [];
    }),
    loadAllPages(async (from, to) => {
      const result = await supabase.from("market_signal_snapshots").select("artist_id,source_date,raw_payload")
        .in("artist_id", artistIds).gte("source_date", startDate).lt("source_date", runDate)
        .not("raw_payload->audienceRevaluation", "is", null).order("source_date").order("artist_id").range(from, to);
      if (result.error) throw new Error(`Could not load valuation history: ${result.error.message}`);
      return result.data ?? [];
    })
  ]);
  const adjustments: Record<string, AudienceRevaluation[]> = {};
  for (const row of boundaries) {
    const raw = row.raw_payload as Record<string, unknown> | null;
    const record = readAudienceRevaluation(raw?.audienceRevaluation, row.source_date);
    if (record) (adjustments[row.artist_id] ??= []).push(record);
  }

  const grouped = ((data ?? []) as Pick<
    Database["public"]["Tables"]["price_history"]["Row"],
    "artist_id" | "price" | "price_date"
  >[]).reduce<Record<string, Array<{ price: number; priceDate: string }>>>((memo, row) => {
    memo[row.artist_id] ??= [];
    memo[row.artist_id].push({
      price: priceForTrendAnalysis(Number(row.price), row.price_date, adjustments[row.artist_id] ?? []),
      priceDate: row.price_date
    });
    return memo;
  }, {});

  return Object.fromEntries(
    Object.entries(grouped)
      .map(([artistId, rows]) => [artistId, buildPriceTrendContext(rows, runDate)] as const)
      .filter((entry): entry is readonly [string, PriceTrendContext] => Boolean(entry[1]))
  );
}

function buildPriceTrendContext(
  rows: Array<{ price: number; priceDate: string }>,
  runDate: string
): PriceTrendContext | null {
  const cleanRows = rows
    .filter((row) => Number.isFinite(row.price) && row.price > 0)
    .sort((first, second) => first.priceDate.localeCompare(second.priceDate));

  if (!cleanRows.length) {
    return null;
  }

  const latest = cleanRows[cleanRows.length - 1];
  const sevenDayBase = getPriceAtOrBefore(cleanRows, shiftDate(runDate, -7)) ?? cleanRows[0];
  const thirtyDayBase = getPriceAtOrBefore(cleanRows, shiftDate(runDate, -30)) ?? cleanRows[0];
  const dailyReturns = getDailyReturns(cleanRows);

  return {
    sampleCount: cleanRows.length,
    return7dPercent: getReturnPercent(latest.price, sevenDayBase.price),
    return30dPercent: getReturnPercent(latest.price, thirtyDayBase.price),
    realizedVolatilityPercent: getRealizedVolatilityPercent(dailyReturns),
    upDayCount: dailyReturns.filter((value) => value > 0.001).length,
    downDayCount: dailyReturns.filter((value) => value < -0.001).length,
    latestPriceDate: latest.priceDate
  };
}

function getPriceAtOrBefore(rows: Array<{ price: number; priceDate: string }>, targetDate: string) {
  return [...rows].reverse().find((row) => row.priceDate <= targetDate);
}

function getDailyReturns(rows: Array<{ price: number; priceDate: string }>) {
  const returns: number[] = [];

  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1];
    const current = rows[index];

    if (previous.price > 0) {
      returns.push((current.price - previous.price) / previous.price);
    }
  }

  return returns;
}

function getReturnPercent(current: number, baseline: number) {
  if (baseline <= 0) {
    return 0;
  }

  return (current / baseline - 1) * 100;
}

function getRealizedVolatilityPercent(returns: number[]) {
  if (returns.length < 2) {
    return 0;
  }

  const average = returns.reduce((total, value) => total + value, 0) / returns.length;
  const variance =
    returns.reduce((total, value) => total + (value - average) ** 2, 0) / Math.max(1, returns.length - 1);

  return Math.sqrt(variance) * 100;
}

async function loadStatsByArtist(supabase: Supabase, artistIds: string[]) {
  if (!artistIds.length) {
    return {};
  }

  const { data, error } = await supabase.from("artist_stats").select("*").in("artist_id", artistIds);

  if (error) {
    throw new Error(`Could not load artist stats: ${error.message}`);
  }

  return ((data ?? []) as ArtistStatsRow[]).reduce<Record<string, ArtistStatsRow>>((grouped, row) => {
    grouped[row.artist_id] = row;
    return grouped;
  }, {});
}

export async function loadArtistExternalIds(
  supabase: Supabase,
  artistIds: string[]
): Promise<Record<string, ArtistExternalIds>> {
  if (!artistIds.length) {
    return {};
  }

  const { data, error } = await supabase.from("artist_external_ids").select("*").in("artist_id", artistIds);

  if (error) {
    throw new Error(`Could not load artist source IDs: ${error.message}`);
  }

  return ((data ?? []) as ArtistExternalIdsRow[]).reduce<Record<string, ArtistExternalIds>>((grouped, row) => {
    grouped[row.artist_id] = applyTrackingExternalIds({
      artistId: row.artist_id,
      spotifyId: row.spotify_id ?? (VERIFIED_SPOTIFY_ARTISTS[row.artist_id]?.musicbrainzId === row.musicbrainz_id ? VERIFIED_SPOTIFY_ARTISTS[row.artist_id].spotifyId : undefined),
      youtubeChannelId: row.youtube_channel_id ?? undefined,
      musicbrainzId: row.musicbrainz_id ?? undefined,
      wikipediaArticleTitle: row.wikipedia_article_title ?? undefined,
      lastfmName: row.lastfm_name ?? undefined,
      gdeltQuery: row.gdelt_query ?? undefined
    });
    return grouped;
  }, {});
}

export async function upsertArtistExternalIds(
  supabase: Supabase,
  records: ArtistExternalIdUpsert[]
): Promise<Record<string, ArtistExternalIds>> {
  if (!records.length) {
    return {};
  }

  const artistIds = records.map((record) => record.artistId);
  const existing = await loadArtistExternalIds(supabase, artistIds);
  const rows = records.map((record) => {
    const current = existing[record.artistId];

    return {
      artist_id: record.artistId,
      spotify_id: record.spotifyId !== undefined ? record.spotifyId : current?.spotifyId ?? null,
      youtube_channel_id:
        record.youtubeChannelId !== undefined ? record.youtubeChannelId : current?.youtubeChannelId ?? null,
      musicbrainz_id: record.musicbrainzId !== undefined ? record.musicbrainzId : current?.musicbrainzId ?? null,
      wikipedia_article_title:
        record.wikipediaArticleTitle !== undefined
          ? record.wikipediaArticleTitle
          : current?.wikipediaArticleTitle ?? null,
      lastfm_name: record.lastfmName !== undefined ? record.lastfmName : current?.lastfmName ?? null,
      gdelt_query: record.gdeltQuery !== undefined ? record.gdeltQuery : current?.gdeltQuery ?? null
    };
  });
  const { data, error } = await supabase
    .from("artist_external_ids")
    .upsert(rows, { onConflict: "artist_id" })
    .select("*");

  if (error) {
    throw new Error(`Could not save artist source IDs: ${error.message}`);
  }

  return ((data ?? []) as ArtistExternalIdsRow[]).reduce<Record<string, ArtistExternalIds>>((grouped, row) => {
    grouped[row.artist_id] = {
      artistId: row.artist_id,
      spotifyId: row.spotify_id ?? undefined,
      youtubeChannelId: row.youtube_channel_id ?? undefined,
      musicbrainzId: row.musicbrainz_id ?? undefined,
      wikipediaArticleTitle: row.wikipedia_article_title ?? undefined,
      lastfmName: row.lastfm_name ?? undefined,
      gdeltQuery: row.gdelt_query ?? undefined
    };
    return grouped;
  }, {});
}

export async function loadObservationBaselines({
  supabase,
  artistIds,
  source,
  metrics,
  beforeDate,
  lookbackDays,
  strategy = "average",
  annualComparison = false
}: {
  supabase: Supabase;
  artistIds: string[];
  source: string;
  metrics: string[];
  beforeDate: string;
  lookbackDays: number;
  strategy?: "average" | "latest";
  annualComparison?: boolean;
}): Promise<ObservationBaselines> {
  if (!artistIds.length || !metrics.length) {
    return {};
  }

  const startDate = shiftDate(beforeDate, -lookbackDays);
  const annualStartDate = shiftDate(beforeDate, -372);
  const annualEndDate = shiftDate(beforeDate, -358);
  const loadWindow = (start: string, end: string, inclusive: boolean) => loadAllPages(async (from, to) => {
    const readPage = async () => {
      let query = supabase.from("market_observations")
        .select("artist_id,metric,value,observed_date,observed_at")
        .in("artist_id", artistIds).eq("source", source).in("metric", metrics).gte("observed_date", start);
      query = inclusive ? query.lte("observed_date", end) : query.lt("observed_date", end);
      return query.order("observed_date", { ascending: false }).order("artist_id").order("metric").range(from, to);
    };
    let result = await readPage();
    // Retry only an explicit transient database cancellation, once, for this
    // read-only page. A repeated failure still blocks unverified repricing.
    if (result.error?.code === "57014") result = await readPage();
    if (result.error) throw new Error(`Could not load ${source} observation baselines: ${result.error.message}`);
    return result.data ?? [];
  });
  const [rows, annualRows] = await Promise.all([
    loadWindow(startDate, beforeDate, false),
    annualComparison ? loadWindow(annualStartDate, annualEndDate, true) : Promise.resolve([])
  ]);

  if (strategy === "latest") {
    const baselines = rows.reduce<ObservationBaselines>((memo, row) => {
      memo[row.artist_id] ??= {};

      if (typeof memo[row.artist_id][row.metric] !== "number") {
        memo[row.artist_id][row.metric] = Number(row.value);
        memo[row.artist_id][getBaselineAgeMetric(row.metric)] = getDateDistanceDays(beforeDate, row.observed_date);
        const observedAtMilliseconds = new Date(row.observed_at).getTime();

        if (Number.isFinite(observedAtMilliseconds)) {
          memo[row.artist_id][`${row.metric}__observed_at_ms`] = observedAtMilliseconds;
        }
      }

      return memo;
    }, {});

    addRateBaselines(baselines, rows, "recent");
    addRateBaselines(baselines, annualRows, "year_ago");
    addAnnualLevelBaselines(baselines, annualRows, beforeDate);

    return baselines;
  }

  const grouped = rows.reduce<
    Record<string, Record<string, { total: number; count: number }>>
  >((memo, row) => {
    memo[row.artist_id] ??= {};
    memo[row.artist_id][row.metric] ??= { total: 0, count: 0 };
    memo[row.artist_id][row.metric].total += Number(row.value);
    memo[row.artist_id][row.metric].count += 1;
    return memo;
  }, {});

  return Object.fromEntries(
    Object.entries(grouped).map(([artistId, metricValues]) => [
      artistId,
      Object.fromEntries(
        Object.entries(metricValues).map(([metric, value]) => [metric, value.total / Math.max(1, value.count)])
      )
    ])
  );
}

function addRateBaselines(
  baselines: ObservationBaselines,
  rows: Array<Pick<MarketObservationRow, "artist_id" | "metric" | "value" | "observed_date" | "observed_at">>,
  period: "recent" | "year_ago"
) {
  const grouped = groupObservationRows(rows);

  for (const [artistId, metrics] of Object.entries(grouped)) {
    baselines[artistId] ??= {};

    for (const [metric, metricRows] of Object.entries(metrics)) {
      const rates = metricRows
        .slice(1)
        .map((row, index) => {
          const previous = metricRows[index];
          const days = previous ? getObservationDistanceDays(row, previous) : 0;

          return days > 0 && previous ? (Number(row.value) - Number(previous.value)) / days : null;
        })
        .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

      if (!rates.length) {
        continue;
      }

      const latestCompletedRate = rates[rates.length - 1];
      const comparisonRates = rates.length > 1 ? rates.slice(0, -1) : [];

      if (period === "recent" && typeof latestCompletedRate === "number") {
        baselines[artistId][`${metric}__latest_completed_daily_rate`] = latestCompletedRate;
      }

      // Compare the latest completed interval with the intervals that preceded
      // it. Including the latest value in its own baseline dampens real changes.
      const referenceRates = comparisonRates.length ? comparisonRates : rates;
      baselines[artistId][`${metric}__${period}_daily_rate`] = median(referenceRates);
      baselines[artistId][`${metric}__${period}_rate_samples`] = comparisonRates.length;
    }
  }
}

function addAnnualLevelBaselines(
  baselines: ObservationBaselines,
  rows: Array<Pick<MarketObservationRow, "artist_id" | "metric" | "value" | "observed_date" | "observed_at">>,
  beforeDate: string
) {
  const targetDate = shiftDate(beforeDate, -365);
  const grouped = groupObservationRows(rows);

  for (const [artistId, metrics] of Object.entries(grouped)) {
    baselines[artistId] ??= {};

    for (const [metric, metricRows] of Object.entries(metrics)) {
      const closest = [...metricRows].sort(
        (first, second) =>
          getAbsoluteDateDistanceDays(first.observed_date, targetDate) -
          getAbsoluteDateDistanceDays(second.observed_date, targetDate)
      )[0];

      if (closest) {
        baselines[artistId][`${metric}__year_ago_value`] = Number(closest.value);
      }
    }
  }
}

function groupObservationRows(
  rows: Array<Pick<MarketObservationRow, "artist_id" | "metric" | "value" | "observed_date" | "observed_at">>
) {
  const grouped: Record<
    string,
    Record<string, Array<Pick<MarketObservationRow, "value" | "observed_date" | "observed_at">>>
  > = {};

  for (const row of rows) {
    grouped[row.artist_id] ??= {};
    grouped[row.artist_id][row.metric] ??= [];
    grouped[row.artist_id][row.metric].push({
      value: row.value,
      observed_date: row.observed_date,
      observed_at: row.observed_at
    });
  }

  for (const metrics of Object.values(grouped)) {
    for (const metricRows of Object.values(metrics)) {
      metricRows.sort((first, second) => getObservationTime(first) - getObservationTime(second));
    }
  }

  return grouped;
}

function median(values: number[]) {
  const sorted = [...values].sort((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2
    ? sorted[middle]
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

export async function loadLatestObservationPayloads({
  supabase,
  artistIds,
  source,
  metric,
  beforeDate,
  lookbackDays
}: {
  supabase: Supabase;
  artistIds: string[];
  source: string;
  metric: string | string[];
  beforeDate: string;
  lookbackDays: number;
}): Promise<Record<string, Record<string, unknown>>> {
  if (!artistIds.length) {
    return {};
  }

  const startDate = shiftDate(beforeDate, -lookbackDays);
  const rows = await loadAllPages(async (from, to) => {
    let query = supabase
      .from("market_observations")
      .select("artist_id,observed_date,raw_payload")
      .in("artist_id", artistIds)
      .eq("source", source)
      .gte("observed_date", startDate)
      .lt("observed_date", beforeDate)
      .order("observed_date", { ascending: false })
      .order("observed_at", { ascending: false }).order("artist_id").order("metric");
    query = Array.isArray(metric) ? query.in("metric", metric) : query.eq("metric", metric);
    const { data, error } = await query.range(from, to);
    if (error) throw new Error(`Could not load observation payloads: ${error.message}`);
    return data ?? [];
  });

  return (rows as Pick<MarketObservationRow, "artist_id" | "observed_date" | "raw_payload">[])
    .reduce<Record<string, Record<string, unknown>>>((memo, row) => {
      if (!memo[row.artist_id] && row.raw_payload && typeof row.raw_payload === "object" && !Array.isArray(row.raw_payload)) {
        memo[row.artist_id] = row.raw_payload as Record<string, unknown>;
      } else if (source === "apple_charts" && row.raw_payload && typeof row.raw_payload === "object" && !Array.isArray(row.raw_payload)) {
        memo[row.artist_id] = mergeSameDayAppleSnapshots(memo[row.artist_id], row.raw_payload as Record<string, unknown>);
      }

      return memo;
    }, {});
}

export async function loadLatestObservationDates({
  supabase,
  artistIds,
  source,
  metric,
  runDate,
  lookbackDays = 400
}: {
  supabase: Supabase;
  artistIds: string[];
  source: string;
  metric: string;
  runDate: string;
  lookbackDays?: number;
}): Promise<Record<string, string>> {
  if (!artistIds.length) {
    return {};
  }

  const { data, error } = await supabase
    .from("market_observations")
    .select("artist_id,observed_date")
    .in("artist_id", artistIds)
    .eq("source", source)
    .eq("metric", metric)
    .gte("observed_date", shiftDate(runDate, -lookbackDays))
    .lte("observed_date", runDate)
    .order("observed_date", { ascending: false })
    .limit(Math.min(10000, Math.max(artistIds.length * lookbackDays, artistIds.length)));

  if (error) {
    throw new Error(`Could not load latest observation dates: ${error.message}`);
  }

  return ((data ?? []) as Pick<MarketObservationRow, "artist_id" | "observed_date">[]).reduce<
    Record<string, string>
  >((latest, row) => {
    if (!latest[row.artist_id] || row.observed_date > latest[row.artist_id]) {
      latest[row.artist_id] = row.observed_date;
    }

    return latest;
  }, {});
}

export async function loadLatestSourceObservationTimes({
  supabase,
  artistIds,
  source,
  runDate,
  lookbackDays = 400
}: {
  supabase: Supabase;
  artistIds: string[];
  source: string;
  runDate: string;
  lookbackDays?: number;
}): Promise<Record<string, string>> {
  if (!artistIds.length) {
    return {};
  }

  const data = await loadAllPages(async (from, to) => {
    const { data, error } = await supabase.from("market_observations")
      .select("artist_id,observed_date,observed_at")
      .in("artist_id", artistIds).eq("source", source)
      .gte("observed_date", shiftDate(runDate, -lookbackDays)).lte("observed_date", runDate)
      .order("observed_at", { ascending: false }).order("artist_id").order("metric").range(from, to);
    if (error) throw new Error(`Could not load latest ${source} observation times: ${error.message}`);
    return data ?? [];
  });

  return ((data ?? []) as Pick<MarketObservationRow, "artist_id" | "observed_date" | "observed_at">[]).reduce<
    Record<string, string>
  >((latest, row) => {
    const observedAt = row.observed_at || `${row.observed_date}T00:00:00.000Z`;

    if (!latest[row.artist_id] || observedAt > latest[row.artist_id]) {
      latest[row.artist_id] = observedAt;
    }

    return latest;
  }, {});
}

function getBaselineAgeMetric(metric: string) {
  return `${metric}__age_days`;
}

function getDateDistanceDays(laterDate: string, earlierDate: string) {
  const later = new Date(`${laterDate}T00:00:00.000Z`).getTime();
  const earlier = new Date(`${earlierDate}T00:00:00.000Z`).getTime();

  if (!Number.isFinite(later) || !Number.isFinite(earlier)) {
    return 1;
  }

  return Math.max(1, Math.round((later - earlier) / 86_400_000));
}

function getObservationDistanceDays(
  later: Pick<MarketObservationRow, "observed_date" | "observed_at">,
  earlier: Pick<MarketObservationRow, "observed_date" | "observed_at">
) {
  const elapsedMilliseconds = getObservationTime(later) - getObservationTime(earlier);

  if (!Number.isFinite(elapsedMilliseconds) || elapsedMilliseconds <= 0) {
    return getDateDistanceDays(later.observed_date, earlier.observed_date);
  }

  return elapsedMilliseconds / 86_400_000;
}

function getObservationTime(
  observation: Pick<MarketObservationRow, "observed_date" | "observed_at">
) {
  const observedAt = new Date(observation.observed_at).getTime();

  return Number.isFinite(observedAt)
    ? observedAt
    : new Date(`${observation.observed_date}T00:00:00.000Z`).getTime();
}

function getAbsoluteDateDistanceDays(firstDate: string, secondDate: string) {
  const first = new Date(`${firstDate}T00:00:00.000Z`).getTime();
  const second = new Date(`${secondDate}T00:00:00.000Z`).getTime();

  if (!Number.isFinite(first) || !Number.isFinite(second)) {
    return Number.MAX_SAFE_INTEGER;
  }

  return Math.abs(Math.round((first - second) / 86_400_000));
}

export async function persistMarketObservations(supabase: Supabase, observations: MarketObservation[]) {
  if (!observations.length) {
    return;
  }

  await removeResolvedObservationErrors(supabase, observations);

  const { error } = await supabase.from("market_observations").upsert(
    observations.map((observation) => ({
      artist_id: observation.artistId,
      source: observation.source,
      metric: observation.metric,
      observed_date: observation.observedDate,
      observed_at: observation.observedAt ?? new Date().toISOString(),
      value: observation.value,
      unit: observation.unit,
      raw_payload: observation.rawPayload as Json
    })),
    { onConflict: "artist_id,source,metric,observed_date" }
  );

  if (error) {
    throw new Error(`Could not save market observations: ${error.message}`);
  }
}

async function removeResolvedObservationErrors(supabase: Supabase, observations: MarketObservation[]) {
  const failedKeys = new Set(
    observations
      .filter((observation) => observation.metric === "request_error")
      .map((observation) => `${observation.artistId}\u0000${observation.source}\u0000${observation.observedDate}`)
  );
  const resolvedGroups = new Map<string, Set<string>>();

  for (const observation of observations) {
    const key = `${observation.artistId}\u0000${observation.source}\u0000${observation.observedDate}`;

    if (observation.metric === "request_error" || failedKeys.has(key)) {
      continue;
    }

    const groupKey = `${observation.source}\u0000${observation.observedDate}`;
    const artistIds = resolvedGroups.get(groupKey) ?? new Set<string>();
    artistIds.add(observation.artistId);
    resolvedGroups.set(groupKey, artistIds);
  }

  for (const [groupKey, artistIds] of resolvedGroups) {
    const [source, observedDate] = groupKey.split("\u0000");
    const { error } = await supabase
      .from("market_observations")
      .delete()
      .eq("source", source)
      .eq("metric", "request_error")
      .eq("observed_date", observedDate)
      .in("artist_id", [...artistIds]);

    if (error) {
      throw new Error(`Could not clear resolved ${source} observation errors: ${error.message}`);
    }
  }
}

export async function loadRecentMarketEvents({
  supabase,
  artistIds,
  runDate,
  lookbackDays
}: {
  supabase: Supabase;
  artistIds: string[];
  runDate: string;
  lookbackDays: number;
}): Promise<Record<string, MarketEvent[]>> {
  if (!artistIds.length) {
    return {};
  }

  const startDate = shiftDate(runDate, -lookbackDays);
  const data = await loadAllPages(async (from, to) => {
    const result = await supabase.from("market_events").select("*")
      .in("artist_id", artistIds).gte("event_date", startDate).lte("event_date", runDate)
      .order("event_date", { ascending: false }).order("id").range(from, to);
    if (result.error) throw new Error(`Could not load market events: ${result.error.message}`);
    return result.data ?? [];
  });

  return ((data ?? []) as MarketEventRow[]).reduce<Record<string, MarketEvent[]>>((grouped, row) => {
    const event: MarketEvent = {
      id: row.id,
      artistId: row.artist_id,
      eventDate: row.event_date,
      eventType: row.event_type,
      title: decodeHtmlEntities(row.title),
      sourceName: row.source_name ?? undefined,
      sourceUrl: row.source_url ?? undefined,
      sentimentScore: Number(row.sentiment_score),
      impactScore: Number(row.impact_score),
      confidence: Number(row.confidence),
      rawPayload: row.raw_payload as Record<string, unknown>
    };

    if (!isMarketEventSourceIntegrityValid(event)) {
      return grouped;
    }

    grouped[row.artist_id] ??= [];
    grouped[row.artist_id].push(event);
    return grouped;
  }, {});
}

export async function persistMarketEvents(supabase: Supabase, events: MarketEvent[]) {
  const integrityCheckedEvents = events
    .filter(isMarketEventSourceIntegrityValid)
    .map((event) => ({ ...event, title: decodeHtmlEntities(event.title) }));

  if (!integrityCheckedEvents.length) {
    return;
  }

  const dedupedEvents = dedupeEventsForPersistence(integrityCheckedEvents);
  await removeConflictingEventClassifications(supabase, dedupedEvents);
  await removeConflictingSourceEvents(supabase, dedupedEvents);
  const rows = dedupedEvents.map((event) => ({
    artist_id: event.artistId,
    event_date: event.eventDate,
    event_type: event.eventType,
    title: event.title,
    source_name: event.sourceName ?? null,
    source_url: event.sourceUrl ?? null,
    sentiment_score: event.sentimentScore,
    impact_score: event.impactScore,
    confidence: event.confidence,
    raw_payload: event.rawPayload as Json
  }));

  const { error } = await supabase.from("market_events").upsert(rows, {
    onConflict: "artist_id,event_type,event_date,title"
  });

  if (error) {
    throw new Error(`Could not save market events: ${error.message}`);
  }
}

export function dedupeEventsForPersistence(events: MarketEvent[]) {
  const selected = new Map<string, MarketEvent>();

  for (const event of events) {
    const sourceUrl = normalizeEventSourceUrl(event.sourceUrl);
    const key = sourceUrl
      ? `${event.artistId}\u0000source\u0000${sourceUrl}`
      : `${event.artistId}\u0000event\u0000${event.eventType}\u0000${event.eventDate}\u0000${event.title}`;
    const current = selected.get(key);

    if (!current || getEventPersistencePriority(event) > getEventPersistencePriority(current)) {
      selected.set(key, sourceUrl ? { ...event, sourceUrl } : event);
    }
  }

  return [...selected.values()];
}

function getEventPersistencePriority(event: MarketEvent) {
  return Math.abs(event.impactScore) * event.confidence;
}

function normalizeEventSourceUrl(value: string | undefined) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    url.hash = "";

    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:utm_|mc_|bil$|debugld$)/i.test(key)) {
        url.searchParams.delete(key);
      }
    }

    return url.toString();
  } catch {
    return value.trim() || null;
  }
}

async function removeConflictingSourceEvents(supabase: Supabase, events: MarketEvent[]) {
  const sourcedEvents = events.filter((event) => Boolean(event.sourceUrl));

  if (!sourcedEvents.length) {
    return;
  }

  const artistIds = Array.from(new Set(sourcedEvents.map((event) => event.artistId)));
  const sourceUrls = Array.from(new Set(sourcedEvents.flatMap(getEventSourceAliases)));
  const desiredEvents = new Set(
    sourcedEvents.map(
      (event) => `${event.artistId}\u0000${event.sourceUrl}\u0000${event.eventType}\u0000${event.eventDate}\u0000${event.title}`
    )
  );
  const existingEvents: Array<{
    id: string;
    artist_id: string;
    event_date: string;
    event_type: string;
    title: string;
    source_url: string | null;
  }> = [];

  for (let offset = 0; offset < sourceUrls.length; offset += 50) {
    const { data, error } = await supabase
      .from("market_events")
      .select("id,artist_id,event_date,event_type,title,source_url")
      .in("artist_id", artistIds)
      .in("source_url", sourceUrls.slice(offset, offset + 50));

    if (error) {
      throw new Error(`Could not inspect existing market event sources: ${error.message}`);
    }

    existingEvents.push(...(data ?? []));
  }

  const conflictingIds = existingEvents
    .filter(
      (row) =>
        !desiredEvents.has(
          `${row.artist_id}\u0000${row.source_url}\u0000${row.event_type}\u0000${row.event_date}\u0000${row.title}`
        )
    )
    .map((row) => row.id);

  for (let offset = 0; offset < conflictingIds.length; offset += 100) {
    const { error: deleteError } = await supabase
      .from("market_events")
      .delete()
      .in("id", conflictingIds.slice(offset, offset + 100));

    if (deleteError) {
      throw new Error(`Could not replace stale market event sources: ${deleteError.message}`);
    }
  }
}

function getEventSourceAliases(event: MarketEvent) {
  const aliases = [event.sourceUrl];
  const googleNewsUrl = event.rawPayload.googleNewsUrl;

  if (typeof googleNewsUrl === "string") {
    aliases.push(googleNewsUrl);
  }

  return aliases.filter((value): value is string => Boolean(value));
}

async function removeConflictingEventClassifications(supabase: Supabase, events: MarketEvent[]) {
  const artistIds = Array.from(new Set(events.map((event) => event.artistId)));
  const eventDates = events.map((event) => event.eventDate).sort();
  const desiredTypes = new Map(
    events.map((event) => [`${event.artistId}\u0000${event.eventDate}\u0000${event.title}`, event.eventType])
  );
  const { data, error } = await supabase
    .from("market_events")
    .select("id,artist_id,event_date,event_type,title")
    .in("artist_id", artistIds)
    .gte("event_date", eventDates[0])
    .lte("event_date", eventDates[eventDates.length - 1]);

  if (error) {
    throw new Error(`Could not inspect existing market event classifications: ${error.message}`);
  }

  const conflictingIds = (data ?? [])
    .filter((row) => {
      const desiredType = desiredTypes.get(`${row.artist_id}\u0000${row.event_date}\u0000${row.title}`);

      return Boolean(desiredType && desiredType !== row.event_type);
    })
    .map((row) => row.id);

  for (let offset = 0; offset < conflictingIds.length; offset += 100) {
    const { error: deleteError } = await supabase
      .from("market_events")
      .delete()
      .in("id", conflictingIds.slice(offset, offset + 100));

    if (deleteError) {
      throw new Error(`Could not replace stale market event classifications: ${deleteError.message}`);
    }
  }
}

export async function persistMarketUpdates({
  supabase,
  runDate,
  source,
  updates,
  summary,
  recordRun = true,
  intraday = false,
  tickComparisonPrices,
  forceTickArtistIds = []
}: {
  supabase: Supabase;
  runDate: string;
  source: string;
  updates: ArtistMarketUpdate[];
  summary: MarketUpdateSummary;
  recordRun?: boolean;
  intraday?: boolean;
  tickComparisonPrices?: Record<string, number>;
  forceTickArtistIds?: string[];
}) {
  if (!recordRun) {
    return await persistUpdateBatch(supabase, runDate, updates, {
      intraday,
      tickComparisonPrices,
      forceTickArtistIds
    });
  }

  const started = await supabase
    .from("market_update_runs")
    .upsert(
      {
        run_date: runDate,
        status: "running",
        source,
        model_version: summary.modelVersion,
        started_at: new Date().toISOString(),
        completed_at: null,
        summary: {},
        error_message: null
      },
      { onConflict: "run_date" }
    )
    .select("id")
    .single();

  if (started.error) {
    throw new Error(`Could not start market update run: ${started.error.message}`);
  }

  try {
    const publication = await persistUpdateBatch(supabase, runDate, updates, { intraday, tickComparisonPrices, forceTickArtistIds });

    const completed = await supabase
      .from("market_update_runs")
      .update({
        status: "succeeded",
        model_version: summary.modelVersion,
        completed_at: new Date().toISOString(),
        summary: summary as unknown as Json
      })
      .eq("run_date", runDate);

    if (completed.error) {
      throw new Error(`Could not complete market update run: ${completed.error.message}`);
    }
    return publication;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown market update failure.";
    await supabase
      .from("market_update_runs")
      .update({
        status: "failed",
        model_version: summary.modelVersion,
        completed_at: new Date().toISOString(),
        error_message: message
      })
      .eq("run_date", runDate);
    throw error;
  }
}

async function persistUpdateBatch(
  supabase: Supabase,
  runDate: string,
  updates: ArtistMarketUpdate[],
  options: {
    intraday?: boolean;
    tickComparisonPrices?: Record<string, number>;
    forceTickArtistIds?: string[];
  } = {}
) {
  if (!updates.length) {
    throw new Error("Cannot publish an empty market quote batch.");
  }

  const forcedTickArtistIds = new Set(options.forceTickArtistIds ?? []);

  const statsRows = updates.map((update) => ({
    artist_id: update.artistId,
    streaming_growth: update.stats.streamingGrowth,
    youtube_growth: update.stats.youtubeGrowth,
    search_growth: update.stats.searchGrowth,
    social_growth: update.stats.socialGrowth,
    news_score: update.stats.newsScore,
    trader_demand: update.stats.traderDemand
  }));
  const signalRows = updates.map((update) => ({
    artist_id: update.artistId,
    source_date: runDate,
    streaming_growth: update.stats.streamingGrowth,
    youtube_growth: update.stats.youtubeGrowth,
    search_growth: update.stats.searchGrowth,
    social_growth: update.stats.socialGrowth,
    news_score: update.stats.newsScore,
    trader_demand: update.stats.traderDemand,
    model_version: update.modelVersion,
    raw_payload: update.rawPayload as Json
  }));
  const historyRows = updates.map((update) => ({
    artist_id: update.artistId,
    price_date: runDate,
    price: update.currentPrice,
    hype_score: update.hypeScore,
    model_version: update.modelVersion,
    explanation: update.explanation
  }));
  const tickRows = updates
    .filter((update) => {
      const comparisonPrice = options.tickComparisonPrices?.[update.artistId];

      return shouldRecordIntradayPriceTick({
        currentPrice: update.currentPrice,
        comparisonPrice,
        forced: forcedTickArtistIds.has(update.artistId)
      });
    })
    .map((update) => ({
      artist_id: update.artistId,
      price: update.currentPrice,
      source: "market_run" as const,
      model_version: update.modelVersion,
      raw_payload: {
        source: "market_run",
        runDate,
        ticker: update.ticker,
        dailyChangePercent: update.dailyChangePercent,
        intraday: options.intraday === true
      } as Json
    }));

  const pricingStates = updates.filter(update => typeof update.rawPayload.source === "string" &&
    !["manual", "mock"].includes(update.rawPayload.source)).map(update => ({
      artist_id: update.artistId, source: "market_pricing", metric: "evidence_state", observed_date: runDate,
      observed_at: new Date().toISOString(), value: 1, unit: "state",
      raw_payload: { version: 1, runDate, modelVersion: update.modelVersion, atomic: false,
        pricingSignalPercent: update.signalDelta * 100, executedReturnPercent: update.dailyChangePercent,
        marketEvents: (update.rawPayload.market_events ?? null) as Json,
        receptionPricingBaseline: (update.rawPayload.receptionPricingBaseline ?? {}) as Json } as Json
    }));
  // Migration 046 is installed in production. Every live publication now
  // requires its transaction; missing inputs or RPCs must never permit partial writes.
  if (typeof supabase.rpc !== "function" || pricingStates.length !== updates.length ||
    !updates.every(update => Number.isFinite(options.tickComparisonPrices?.[update.artistId]) &&
      Number(options.tickComparisonPrices?.[update.artistId]) > 0)) {
    throw new Error("Atomic quote publication requires live evidence and original comparison prices for every artist.");
  }
  const publication = await supabase.rpc("persist_market_quote_batch", {
    p_run_date: runDate, p_intraday: options.intraday === true,
    p_stats: statsRows, p_signals: signalRows, p_history: historyRows,
    p_quotes: updates.map(update => ({ id: update.artistId, previous_close: update.previousClose,
      current_price: update.currentPrice, daily_change_percent: update.dailyChangePercent,
      hype_score: update.hypeScore, last_move_explanation: update.explanation })),
    p_ticks: tickRows, p_pricing_state: pricingStates, p_comparison_prices: options.tickComparisonPrices as Json
  });
  if (publication.error) throw new Error(`Atomic quote publication failed: ${publication.error.message}`);
  const result = publication.data as { atomic?: boolean; artistCount?: number; priceTickCount?: number } | null;
  if (!result || result.atomic !== true || result.artistCount !== updates.length || result.priceTickCount !== tickRows.length) {
    throw new Error("Could not verify atomic quote publication completion.");
  }
  return { priceTickCount: result.priceTickCount, atomic: true };
}

function mapStats(stats: ArtistStatsRow | null): HypeStats {
  return {
    streamingGrowth: Number(stats?.streaming_growth ?? 0),
    youtubeGrowth: Number(stats?.youtube_growth ?? 0),
    searchGrowth: Number(stats?.search_growth ?? 0),
    socialGrowth: Number(stats?.social_growth ?? 0),
    newsScore: Number(stats?.news_score ?? 50),
    traderDemand: Number(stats?.trader_demand ?? 0)
  };
}

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);

  return value.toISOString().slice(0, 10);
}
