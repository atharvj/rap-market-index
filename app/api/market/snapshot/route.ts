import { NextResponse } from "next/server";
import { createInitialGameState } from "@/lib/market";
import { createAnonServerClient, getSupabaseConfigStatus } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import type { Artist, GameState, HypeStats, PricePoint } from "@/lib/types";
import { getPacificMarketDate, shiftMarketDate } from "@/server/market/market-date";

export const dynamic = "force-dynamic";

type ArtistRow = Database["public"]["Tables"]["artists"]["Row"];
type ArtistStatsRow = Database["public"]["Tables"]["artist_stats"]["Row"];

type PriceHistoryPoint = Pick<
  Database["public"]["Tables"]["price_history"]["Row"],
  "artist_id" | "price_date" | "price"
>;

const PRICE_HISTORY_LOOKBACK_DAYS = 28;

export async function GET() {
  const config = getSupabaseConfigStatus();

  if (!config.readyForPublicReads) {
    return NextResponse.json({
      ok: true,
      source: "mock",
      config,
      state: createInitialGameState()
    });
  }

  try {
    const supabase = createAnonServerClient();
    const { data: artists, error: artistError } = await supabase
      .from("artists")
      .select("*")
      .eq("is_active", true)
      .order("ticker", { ascending: true });

    if (artistError) {
      throw new Error(`Could not load artists: ${artistError.message}`);
    }

    const typedArtists = (artists ?? []) as ArtistRow[];
    const statsByArtist = await loadStatsByArtist(
      typedArtists.map((artist) => artist.id),
      supabase
    );
    const historyByArtist = await loadHistoryByArtist(
      typedArtists.map((artist) => artist.id),
      supabase
    );
    const fallback = createInitialGameState();
    const state: GameState = {
      ...fallback,
      artists: typedArtists.map((artist) =>
        mapArtist(artist, statsByArtist[artist.id] ?? null, historyByArtist[artist.id] ?? [])
      ),
      holdings: [],
      transactions: [],
      lastUpdatedAt: getPacificMarketDate()
    };

    return NextResponse.json({
      ok: true,
      source: "supabase",
      config,
      state
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        source: "supabase",
        config,
        error: error instanceof Error ? error.message : "Could not load market snapshot."
      },
      { status: 500 }
    );
  }
}

async function loadStatsByArtist(
  artistIds: string[],
  supabase: ReturnType<typeof createAnonServerClient>
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
  supabase: ReturnType<typeof createAnonServerClient>
): Promise<Record<string, PricePoint[]>> {
  if (!artistIds.length) {
    return {};
  }

  const { data, error } = await supabase
    .from("price_history")
    .select("artist_id, price_date, price")
    .in("artist_id", artistIds)
    .gte("price_date", shiftMarketDate(getPacificMarketDate(), -PRICE_HISTORY_LOOKBACK_DAYS))
    .order("price_date", { ascending: true });

  if (error) {
    throw new Error(`Could not load price history: ${error.message}`);
  }

  return ((data ?? []) as PriceHistoryPoint[]).reduce<Record<string, PricePoint[]>>((grouped, point) => {
    grouped[point.artist_id] ??= [];
    grouped[point.artist_id].push({
      date: point.price_date,
      price: Number(point.price)
    });
    return grouped;
  }, {});
}

function mapArtist(row: ArtistRow, stats: ArtistStatsRow | null, history: PricePoint[]): Artist {
  const fallbackHistory = [
    {
      date: getPacificMarketDate(),
      price: Number(row.current_price)
    }
  ];

  return {
    id: row.id,
    name: row.name,
    ticker: row.ticker,
    currentPrice: Number(row.current_price),
    previousClose: Number(row.previous_close),
    dailyChangePercent: Number(row.daily_change_percent),
    hypeScore: row.hype_score,
    volatility: Number(row.volatility),
    category: row.category,
    accent: row.accent,
    stats: mapStats(stats),
    priceHistory: history.length ? history.slice(-PRICE_HISTORY_LOOKBACK_DAYS) : fallbackHistory,
    lastMoveExplanation: row.last_move_explanation
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
