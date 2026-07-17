import { NextResponse } from "next/server";
import { createInitialGameState } from "@/lib/market";
import {
  buildDailyPriceSeries,
  buildIntradayPriceSeries,
  hasPriceMovement,
  keepLatestMarketRunPerDate
} from "@/lib/price-series";
import { createServiceRoleClient, getSupabaseConfigStatus } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import type { PricePoint } from "@/lib/types";
import { getPacificMarketDate, shiftMarketDate } from "@/server/market/market-date";
import { reportServerError } from "@/server/observability";

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
  "1M": 31,
  "3M": 93,
  "6M": 186,
  "1Y": 365
};
const CACHE_HEADERS = { "Cache-Control": "public, max-age=30, s-maxage=60, stale-while-revalidate=300" };

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
    const points = range === "1D"
      ? buildIntradayPriceSeries({ ticks, currentPrice })
      : buildDailyPriceSeries({
          dailyHistory: history,
          currentPrice,
          marketDate: getPacificMarketDate(),
          includeCurrentQuote: false
        });

    return NextResponse.json({
      ok: true,
      source: "supabase",
      artistId,
      range,
      granularity: range === "1D" ? "intraday" : "daily",
      points,
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
  let query = supabase
    .from("price_history")
    .select("price_date, price")
    .eq("artist_id", artistId)
    .order("price_date", { ascending: true });

  if (range !== "ALL") {
    query = query.gte("price_date", shiftMarketDate(getPacificMarketDate(), -RANGE_DAYS[range]));
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Could not load price history: ${error.message}`);
  }

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
  const { data, error } = await supabase
    .from("price_ticks")
    .select("observed_at, price, source, raw_payload")
    .eq("artist_id", artistId)
    .neq("source", "migration")
    .gte("observed_at", cutoff)
    .order("observed_at", { ascending: false })
    .limit(900);

  if (error) {
    if (isMissingPriceTicksError(error.message)) {
      return [];
    }

    throw new Error(`Could not load price ticks: ${error.message}`);
  }

  const ticks = ((data ?? []) as PriceTickRow[])
    .reverse()
    .map((point) => ({
      date: point.observed_at,
      price: Number(point.price),
      source: point.source,
      marketDate: getTickMarketDate(point)
    }));

  return keepLatestMarketRunPerDate(ticks);
}

function getTickMarketDate(point: PriceTickRow) {
  if (point.raw_payload && typeof point.raw_payload === "object" && !Array.isArray(point.raw_payload)) {
    const runDate = point.raw_payload.runDate;

    if (typeof runDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(runDate)) {
      return runDate;
    }
  }

  return getPacificMarketDate(new Date(point.observed_at));
}

function isMissingPriceTicksError(message: string) {
  const normalized = message.toLowerCase();

  return normalized.includes("price_ticks") || normalized.includes("schema cache");
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

  const cutoff = range === "ALL" ? null : shiftMarketDate(getPacificMarketDate(), -RANGE_DAYS[range]);
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
