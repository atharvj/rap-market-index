import { summarizeQuoteFreshness } from "@/lib/quote-freshness";
import { sameQuoteRevisions } from "@/server/market/read-stability";
import { allowDemoMarket, MARKET_ERROR_HEADERS } from "@/server/market/public-response";
import { after, NextResponse } from "next/server";
import { createInitialGameState } from "@/lib/market";
import { sanitizeMoveExplanation } from "@/lib/artist-explanations";
import { loadAllPages } from "@/lib/pagination";
import { DEFAULT_HISTORY_DAYS } from "@/lib/price-series";
import { createServiceRoleClient, getSupabaseConfigStatus } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import type { Artist, GameState, HypeStats, PricePoint } from "@/lib/types";
import { loadArtistImageUrls } from "@/server/market/artist-images";
import { getMarketDate, shiftMarketDate } from "@/server/market/market-date";
import { reportServerError } from "@/server/observability";
import { adjustPriceHistory } from "@/lib/adjusted-price-history";
import { loadChartAdjustments } from "@/server/market/chart-adjustments";
import { recoverStaleMarket } from "@/server/market/market-catchup";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type ArtistRow = Database["public"]["Tables"]["artists"]["Row"];
type ArtistStatsRow = Database["public"]["Tables"]["artist_stats"]["Row"];

type PriceHistoryPoint = Pick<
  Database["public"]["Tables"]["price_history"]["Row"],
  "artist_id" | "price_date" | "price"
>;

const CACHE_HEADERS = { "Cache-Control": "public, max-age=10, s-maxage=15, stale-while-revalidate=60" };
const ERROR_HEADERS = { "Cache-Control": "no-store" };

export async function GET() {
  const config = getSupabaseConfigStatus();

  if (!config.readyForPublicReads) {
    if (!allowDemoMarket()) {
      return NextResponse.json({ ok: false, source: "supabase", error: "Market data is temporarily unavailable." },
        { status: 503, headers: MARKET_ERROR_HEADERS });
    }
    return NextResponse.json({
      ok: true,
      source: "mock",
      state: createInitialGameState()
    }, { headers: CACHE_HEADERS });
  }

  if (!config.serviceRoleConfigured) {
    return NextResponse.json(
      { ok: false, source: "supabase", error: "Market data is temporarily unavailable." },
      { status: 503, headers: ERROR_HEADERS }
    );
  }

  try {
    const supabase = createServiceRoleClient();
    const { state, artistIds } = await loadStableSnapshot(supabase);

    if (process.env.VERCEL_ENV === "production" && artistIds.length) {
      after(async () => {
        try { await recoverStaleMarket({ supabase, artistIds }); }
        catch (error) { reportServerError(error, "market.background-recovery"); }
      });
    }

    return NextResponse.json({
      ok: true,
      source: "supabase",
      state
    }, { headers: CACHE_HEADERS });
  } catch (error) {
    reportServerError(error, "market.snapshot");
    return NextResponse.json(
      {
        ok: false,
        source: "supabase",
        error: "Market data is temporarily unavailable."
      },
      { status: 500, headers: ERROR_HEADERS }
    );
  }
}

async function loadStatsByArtist(
  artistIds: string[],
  supabase: ReturnType<typeof createServiceRoleClient>
): Promise<Record<string, ArtistStatsRow>> {
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

async function loadHistoryByArtist(
  artistIds: string[],
  supabase: ReturnType<typeof createServiceRoleClient>
): Promise<Record<string, PricePoint[]>> {
  if (!artistIds.length) {
    return {};
  }

  const rows = await loadAllPages<PriceHistoryPoint>(async (from, to) => {
    const { data, error } = await supabase
      .from("price_history")
      .select("artist_id, price_date, price")
      .in("artist_id", artistIds)
      .gte("price_date", shiftMarketDate(getMarketDate(), -DEFAULT_HISTORY_DAYS))
      .order("price_date", { ascending: true })
      .order("artist_id", { ascending: true })
      .range(from, to);

    if (error) {
      throw new Error(`Could not load price history: ${error.message}`);
    }

    return (data ?? []) as PriceHistoryPoint[];
  });

  const adjustments = await loadChartAdjustments({ supabase, artistIds,
    earliestDate: shiftMarketDate(getMarketDate(), -DEFAULT_HISTORY_DAYS) });
  const grouped = rows.reduce<Record<string, PricePoint[]>>((grouped, point) => {
    grouped[point.artist_id] ??= [];
    grouped[point.artist_id].push({
      date: point.price_date,
      price: Number(point.price)
    });
    return grouped;
  }, {});
  return Object.fromEntries(Object.entries(grouped).map(([id, points]) => [id, adjustPriceHistory(points, adjustments[id] ?? [])]));
}

function mapArtist(row: ArtistRow, stats: ArtistStatsRow | null, history: PricePoint[], imageUrl?: string): Artist {
  const fallbackHistory = [
    {
      date: getMarketDate(),
      price: Number(row.current_price)
    }
  ];

  const mappedStats = mapStats(stats);

  return {
    id: row.id,
    name: row.name,
    ticker: row.ticker,
    imageUrl,
    currentPrice: Number(row.current_price),
    previousClose: Number(row.previous_close),
    dailyChangePercent: Number(row.daily_change_percent),
    hypeScore: row.hype_score,
    volatility: Number(row.volatility),
    category: row.category,
    accent: row.accent,
    stats: mappedStats,
    priceHistory: history.length ? history : fallbackHistory,
    lastMoveExplanation: sanitizeMoveExplanation(
      row.ticker,
      row.last_move_explanation,
      Number(row.daily_change_percent),
      mappedStats
    )
  };
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

async function loadStableSnapshot(supabase: ReturnType<typeof createServiceRoleClient>, attempt = 0): Promise<{ state: GameState; artistIds: string[] }> {
  const { data: artists, error: artistError } = await supabase
    .from("artists")
    .select("*")
    .eq("is_active", true)
    .order("ticker", { ascending: true });

  if (artistError) {
    throw new Error(`Could not load artists: ${artistError.message}`);
  }

  const typedArtists = (artists ?? []) as ArtistRow[];
  const artistIds = typedArtists.map((artist) => artist.id);
  const [statsByArtist, historyByArtist, imageByArtistId, currentCorrections, completions] = await Promise.all([
    loadStatsByArtist(artistIds, supabase),
    loadHistoryByArtist(artistIds, supabase),
    loadArtistImageUrls(
      supabase,
      artistIds,
      Object.fromEntries(typedArtists.map((artist) => [artist.id, artist.name]))
    ),
    loadAllPages(async (from, to) => {
      const result = await supabase.from("market_valuation_boundaries").select("artist_id")
        .in("artist_id", artistIds).eq("effective_date", getMarketDate()).order("artist_id").range(from, to);
      if (result.error) throw new Error(`Could not verify today's valuation notice: ${result.error.message}`);
      return result.data ?? [];
    }),
    loadAllPages(async (from, to) => {
      const result = await supabase.from("market_observations").select("artist_id,observed_at,observed_date")
        .eq("source", "market_refresh").eq("metric", "completed").in("artist_id", artistIds)
        .in("observed_date", [getMarketDate(), shiftMarketDate(getMarketDate(), -1)])
        .order("artist_id").order("observed_date").range(from, to);
      if (result.error) throw new Error("Could not verify quote freshness.");
      return result.data ?? [];
    })
  ]);
  const verified = await supabase.from("artists").select("id,current_price,updated_at")
    .eq("is_active", true).order("ticker", { ascending: true });
  if (verified.error) throw new Error("Could not verify market quote revisions.");
  if (!sameQuoteRevisions(typedArtists, verified.data ?? [])) {
    if (attempt < 1) return loadStableSnapshot(supabase, attempt + 1);
    throw new Error("Quotes changed during the market read. Retry shortly.");
  }
  if (!typedArtists.length || typedArtists.some(row => !Number.isFinite(Number(row.current_price)) || Number(row.current_price) <= 0)) {
    throw new Error("The market returned invalid current quotes.");
  }
  const fallback = createInitialGameState();
  const state: GameState = {
    ...fallback,
    quoteFreshness: summarizeQuoteFreshness(artistIds, completions, getMarketDate()),
    ...(currentCorrections.length ? { valuationNotice: { date: getMarketDate(), artistCount: currentCorrections.length } } : {}),
    artists: typedArtists.map((artist) =>
      mapArtist(
        artist,
        statsByArtist[artist.id] ?? null,
        historyByArtist[artist.id] ?? [],
        imageByArtistId.get(artist.id)
      )
    ),
    holdings: [],
    shortPositions: [],
    transactions: [],
    lastUpdatedAt: getMarketDate()
  };
  return { state, artistIds };
}
