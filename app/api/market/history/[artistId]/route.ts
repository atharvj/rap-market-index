import { NextResponse } from "next/server";
import { createInitialGameState } from "@/lib/market";
import {
  buildDailyPriceSeries,
  buildIntradayPriceSeries,
  hasPriceMovement,
  ONE_MONTH_HISTORY_DAYS
} from "@/lib/price-series";
import { createServiceRoleClient, getSupabaseConfigStatus } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import type { PricePoint } from "@/lib/types";
import { getMarketDate, shiftMarketDate } from "@/server/market/market-date";
import { reportServerError } from "@/server/observability";
import { loadAllPages } from "@/lib/pagination";
import { adjustPriceHistory } from "@/lib/adjusted-price-history";
import { loadChartAdjustments } from "@/server/market/chart-adjustments";

export const dynamic = "force-dynamic";

type HistoryRange = "1D" | "7D" | "1M" | "3M" | "6M" | "1Y" | "ALL";

type ArtistRow = Pick<Database["public"]["Tables"]["artists"]["Row"], "id" | "current_price">;
type PriceHistoryRow = Pick<Database["public"]["Tables"]["price_history"]["Row"], "price_date" | "price">;
type PriceTickRow = Pick<
  Database["public"]["Tables"]["price_ticks"]["Row"],
  "observed_at" | "price" | "source" | "raw_payload"
>;

const RANGE_DAYS: Record<Exclude<HistoryRange, "ALL">, number> = {
  "1D": 1,
  "7D": 7,
  "1M": ONE_MONTH_HISTORY_DAYS,
  "3M": 93,
  "6M": 186,
  "1Y": 365
};
const CACHE_HEADERS = { "Cache-Control": "public, max-age=10, s-maxage=15, stale-while-revalidate=60" };

export async function GET(request: Request, context: { params: Promise<{ artistId: string }> }) {
  const { artistId } = await context.params;
  const range = normalizeRange(new URL(request.url).searchParams.get("range"));
  const config = getSupabaseConfigStatus();

  if (!config.readyForPublicReads) {
    return NextResponse.json({
      ok: true,
      source: "mock",
      artistId,
      range,
      ...getMockHistoryResponse(artistId, range)
    }, { headers: CACHE_HEADERS });
  }

  if (!config.serviceRoleConfigured) {
    return NextResponse.json(
      { ok: false, error: "Price history is temporarily unavailable." },
      { status: 503, headers: CACHE_HEADERS }
    );
  }

  try {
    const supabase = createServiceRoleClient();
    const { data: artist, error: artistError } = await supabase
      .from("artists")
      .select("id,current_price")
      .eq("id", artistId)
      .eq("is_active", true)
      .single();

    if (artistError || !artist) {
      return NextResponse.json(
        {
          ok: false,
          error: "Artist not found."
        },
        { status: 404, headers: CACHE_HEADERS }
      );
    }

    const history = range === "1D"
      ? []
      : await loadArtistHistory({ supabase, artistId, range });
    const ticks = range === "1D"
      ? await loadArtistTicksIfAvailable({ supabase, artistId })
      : [];
    const currentPrice = Number((artist as ArtistRow).current_price);
    const recordedPoints = range === "1D"
      ? buildIntradayPriceSeries({ ticks, currentPrice })
      : buildDailyPriceSeries({
          dailyHistory: history,
          currentPrice,
          marketDate: getMarketDate(),
          includeCurrentQuote: false
        });
    const adjustments = await loadChartAdjustments({ supabase, artistIds: [artistId],
      earliestDate: range === "ALL" ? undefined : shiftMarketDate(getMarketDate(), -RANGE_DAYS[range]), intraday: range === "1D" });
    const points = adjustPriceHistory(recordedPoints, adjustments[artistId] ?? [], range === "1D" ? "intraday" : "daily");

    return NextResponse.json({
      ok: true,
      source: "supabase",
      artistId,
      range,
      granularity: range === "1D" ? "intraday" : "daily",
      points,
      priceBasis: points.some(point => point.recordedPrice !== undefined) ? "adjusted" : "recorded",
      hasRealHistory: range === "1D" ? ticks.length > 0 : history.length > 0,
      recordedCloseCount: range === "1D" ? 0 : history.length,
      hasMovement: hasPriceMovement(points),
      historyStart: points[0]?.date ?? null,
      historyEnd: points[points.length - 1]?.date ?? null
    }, { headers: CACHE_HEADERS });
  } catch (error) {
    reportServerError(error, "market.history");
    return NextResponse.json(
      {
        ok: false,
        source: "supabase",
        error: "Price history is temporarily unavailable."
      },
      { status: 500 }
    );
  }
}

async function loadArtistHistory({
  supabase,
  artistId,
  range
}: {
  supabase: ReturnType<typeof createServiceRoleClient>;
  artistId: string;
  range: HistoryRange;
}): Promise<PricePoint[]> {
  const data = await loadAllPages(async (from, to) => {
    let query = supabase.from("price_history").select("price_date, price")
      .eq("artist_id", artistId).order("price_date", { ascending: true });
    if (range !== "ALL") query = query.gte("price_date", shiftMarketDate(getMarketDate(), -RANGE_DAYS[range]));
    const result = await query.range(from, to);
    if (result.error) throw new Error(`Could not load price history: ${result.error.message}`);
    return result.data ?? [];
  });

  return ((data ?? []) as PriceHistoryRow[]).map((point) => ({
    date: point.price_date,
    price: Number(point.price)
  }));
}

async function loadArtistTicksIfAvailable({
  supabase,
  artistId
}: {
  supabase: ReturnType<typeof createServiceRoleClient>;
  artistId: string;
}): Promise<PricePoint[]> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const data = await loadAllPages(async (from, to) => {
    const result = await supabase.from("price_ticks").select("observed_at, price, source, raw_payload")
      .eq("artist_id", artistId).neq("source", "migration").gte("observed_at", cutoff)
      .order("observed_at", { ascending: true }).order("id", { ascending: true }).range(from, to);
    if (result.error) {
      if (isMissingPriceTicksError(result.error.message)) return [];
      throw new Error(`Could not load price ticks: ${result.error.message}`);
    }
    return result.data ?? [];
  });
  // Every recorded market update matters intraday, including earlier runs on
  // the same date. The series builder only compresses consecutive equal prices.
  return (data as PriceTickRow[]).map(point => ({ date: point.observed_at, price: Number(point.price) }));
}

function isMissingPriceTicksError(message: string) {
  const normalized = message.toLowerCase();

  return normalized.includes("could not find the table") || normalized.includes("does not exist");
}

function getMockHistoryResponse(artistId: string, range: HistoryRange) {
  const artist = createInitialGameState().artists.find((candidate) => candidate.id === artistId);

  if (!artist) {
    return {
      points: [],
      hasRealHistory: false,
      recordedCloseCount: 0,
      historyStart: null,
      historyEnd: null
    };
  }

  if (range === "1D") {
    const now = new Date();
    const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const points = buildIntradayPriceSeries({
      ticks: [{ date: start.toISOString(), price: artist.previousClose }],
      currentPrice: artist.currentPrice,
      now: now.toISOString()
    });

    return {
      points,
      hasRealHistory: false,
      recordedCloseCount: 0,
      granularity: "intraday" as const,
      hasMovement: hasPriceMovement(points),
      historyStart: points[0]?.date ?? null,
      historyEnd: points[points.length - 1]?.date ?? null
    };
  }

  const cutoff = range === "ALL" ? null : shiftMarketDate(getMarketDate(), -RANGE_DAYS[range]);
  const points = cutoff
    ? artist.priceHistory.filter((point) => point.date >= cutoff)
    : artist.priceHistory;

  return {
    points,
    hasRealHistory: false,
    recordedCloseCount: points.length,
    granularity: "daily",
    hasMovement: hasPriceMovement(points),
    historyStart: points[0]?.date ?? null,
    historyEnd: points[points.length - 1]?.date ?? null
  };
}

function normalizeRange(value: string | null): HistoryRange {
  if (value === "1D" || value === "7D" || value === "1M" || value === "3M" || value === "6M" || value === "1Y" || value === "ALL") {
    return value;
  }

  return "1M";
}
