import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { ArtistMarketUpdate, MarketUpdateArtist, MarketUpdateSummary } from "@/server/market/daily-update";
import type {
  ArtistExternalIds,
  MarketEvent,
  MarketObservation,
  ObservationBaselines
} from "@/server/market/market-data";
import type { ArtistCategory, HypeStats } from "@/lib/types";

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
    hypeScore: row.hype_score,
    volatility: Number(row.volatility),
    category: row.category as ArtistCategory,
    stats: mapStats(statsByArtist[row.id] ?? null)
  }));
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
    grouped[row.artist_id] = {
      artistId: row.artist_id,
      spotifyId: row.spotify_id ?? undefined,
      youtubeChannelId: row.youtube_channel_id ?? undefined,
      musicbrainzId: row.musicbrainz_id ?? undefined,
      lastfmName: row.lastfm_name ?? undefined,
      gdeltQuery: row.gdelt_query ?? undefined
    };
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
  lookbackDays
}: {
  supabase: Supabase;
  artistIds: string[];
  source: string;
  metrics: string[];
  beforeDate: string;
  lookbackDays: number;
}): Promise<ObservationBaselines> {
  if (!artistIds.length || !metrics.length) {
    return {};
  }

  const startDate = shiftDate(beforeDate, -lookbackDays);
  const { data, error } = await supabase
    .from("market_observations")
    .select("artist_id,metric,value")
    .in("artist_id", artistIds)
    .eq("source", source)
    .in("metric", metrics)
    .gte("observed_date", startDate)
    .lt("observed_date", beforeDate);

  if (error) {
    throw new Error(`Could not load observation baselines: ${error.message}`);
  }

  const grouped = ((data ?? []) as Pick<MarketObservationRow, "artist_id" | "metric" | "value">[]).reduce<
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

export async function persistMarketObservations(supabase: Supabase, observations: MarketObservation[]) {
  if (!observations.length) {
    return;
  }

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
  const { data, error } = await supabase
    .from("market_events")
    .select("*")
    .in("artist_id", artistIds)
    .gte("event_date", startDate)
    .lte("event_date", runDate)
    .order("event_date", { ascending: false });

  if (error) {
    throw new Error(`Could not load market events: ${error.message}`);
  }

  return ((data ?? []) as MarketEventRow[]).reduce<Record<string, MarketEvent[]>>((grouped, row) => {
    grouped[row.artist_id] ??= [];
    grouped[row.artist_id].push({
      id: row.id,
      artistId: row.artist_id,
      eventDate: row.event_date,
      eventType: row.event_type,
      title: row.title,
      sourceName: row.source_name ?? undefined,
      sourceUrl: row.source_url ?? undefined,
      sentimentScore: Number(row.sentiment_score),
      impactScore: Number(row.impact_score),
      confidence: Number(row.confidence),
      rawPayload: row.raw_payload as Record<string, unknown>
    });
    return grouped;
  }, {});
}

export async function persistMarketEvents(supabase: Supabase, events: MarketEvent[]) {
  if (!events.length) {
    return;
  }

  const { error } = await supabase.from("market_events").upsert(
    events.map((event) => ({
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
    })),
    { onConflict: "artist_id,event_type,event_date,title" }
  );

  if (error) {
    throw new Error(`Could not save market events: ${error.message}`);
  }
}

export async function persistMarketUpdates({
  supabase,
  runDate,
  source,
  updates,
  summary
}: {
  supabase: Supabase;
  runDate: string;
  source: string;
  updates: ArtistMarketUpdate[];
  summary: MarketUpdateSummary;
}) {
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
    for (const update of updates) {
      await persistOneUpdate(supabase, runDate, update);
    }

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

async function persistOneUpdate(supabase: Supabase, runDate: string, update: ArtistMarketUpdate) {
  const artistUpdate = await supabase
    .from("artists")
    .update({
      previous_close: update.previousClose,
      current_price: update.currentPrice,
      daily_change_percent: update.dailyChangePercent,
      hype_score: update.hypeScore,
      last_move_explanation: update.explanation
    })
    .eq("id", update.artistId);

  if (artistUpdate.error) {
    throw new Error(`Could not update ${update.ticker}: ${artistUpdate.error.message}`);
  }

  const statsUpsert = await supabase.from("artist_stats").upsert(
    {
      artist_id: update.artistId,
      streaming_growth: update.stats.streamingGrowth,
      youtube_growth: update.stats.youtubeGrowth,
      search_growth: update.stats.searchGrowth,
      social_growth: update.stats.socialGrowth,
      news_score: update.stats.newsScore,
      trader_demand: update.stats.traderDemand
    },
    { onConflict: "artist_id" }
  );

  if (statsUpsert.error) {
    throw new Error(`Could not save stats for ${update.ticker}: ${statsUpsert.error.message}`);
  }

  const signalUpsert = await supabase.from("market_signal_snapshots").upsert(
    {
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
    },
    { onConflict: "artist_id,source_date" }
  );

  if (signalUpsert.error) {
    throw new Error(`Could not save signal snapshot for ${update.ticker}: ${signalUpsert.error.message}`);
  }

  const historyUpsert = await supabase.from("price_history").upsert(
    {
      artist_id: update.artistId,
      price_date: runDate,
      price: update.currentPrice,
      hype_score: update.hypeScore,
      model_version: update.modelVersion,
      explanation: update.explanation
    },
    { onConflict: "artist_id,price_date" }
  );

  if (historyUpsert.error) {
    throw new Error(`Could not save price history for ${update.ticker}: ${historyUpsert.error.message}`);
  }
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
