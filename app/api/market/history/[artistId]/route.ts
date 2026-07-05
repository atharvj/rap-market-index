import { NextResponse } from "next/server";
import { createInitialGameState } from "@/lib/market";
import { createAnonServerClient, getSupabaseConfigStatus } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import type { PricePoint } from "@/lib/types";

export const dynamic = "force-dynamic";

type HistoryRange = "1M" | "3M" | "6M" | "1Y" | "ALL";

type ArtistRow = Pick<Database["public"]["Tables"]["artists"]["Row"], "id" | "current_price">;
type PriceHistoryRow = Pick<Database["public"]["Tables"]["price_history"]["Row"], "price_date" | "price">;
type PriceTickRow = Pick<Database["public"]["Tables"]["price_ticks"]["Row"], "observed_at" | "price">;

const RANGE_DAYS: Record<Exclude<HistoryRange, "ALL">, number> = {
  "1M": 31,
  "3M": 93,
  "6M": 186,
  "1Y": 365
};

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
    });
  }

  try {
    const supabase = createAnonServerClient();
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
          error: artistError?.message ?? "Artist not found."
        },
        { status: 404 }
      );
    }

    const history = await loadArtistHistory({
      supabase,
      artistId,
      range
    });
    const ticks = await loadArtistTicksIfAvailable({
      supabase,
      artistId,
      range
    });
    const points = buildHistoryPoints({
      dailyHistory: history,
      ticks,
      currentPrice: Number((artist as ArtistRow).current_price)
    });

    return NextResponse.json({
      ok: true,
      source: "supabase",
      artistId,
      range,
      points,
      hasRealHistory: history.length > 0 || ticks.length > 0,
      historyStart: points[0]?.date ?? null,
      historyEnd: points[points.length - 1]?.date ?? null
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        source: "supabase",
        error: error instanceof Error ? error.message : "Could not load artist history."
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
  supabase: ReturnType<typeof createAnonServerClient>;
  artistId: string;
  range: HistoryRange;
}): Promise<PricePoint[]> {
  let query = supabase
    .from("price_history")
    .select("price_date, price")
    .eq("artist_id", artistId)
    .order("price_date", { ascending: true });

  if (range !== "ALL") {
    query = query.gte("price_date", shiftDate(getToday(), -RANGE_DAYS[range]));
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
  artistId,
  range
}: {
  supabase: ReturnType<typeof createAnonServerClient>;
  artistId: string;
  range: HistoryRange;
}): Promise<PricePoint[]> {
  if (range !== "1M" && range !== "3M") {
    return [];
  }

  const minDate = shiftDate(getToday(), -RANGE_DAYS[range]);
  const { data, error } = await supabase
    .from("price_ticks")
    .select("observed_at, price")
    .eq("artist_id", artistId)
    .gte("observed_at", `${minDate}T00:00:00.000Z`)
    .order("observed_at", { ascending: false })
    .limit(900);

  if (error) {
    if (isMissingPriceTicksError(error.message)) {
      return [];
    }

    throw new Error(`Could not load price ticks: ${error.message}`);
  }

  return ((data ?? []) as PriceTickRow[])
    .map((point) => ({
      date: point.observed_at,
      price: Number(point.price)
    }))
    .reverse();
}

function buildHistoryPoints({
  dailyHistory,
  ticks,
  currentPrice
}: {
  dailyHistory: PricePoint[];
  ticks: PricePoint[];
  currentPrice: number;
}) {
  const base = ticks.length ? ticks : dailyHistory;
  const livePoint = {
    date: new Date().toISOString(),
    price: currentPrice
  };

  if (!base.length) {
    return [livePoint];
  }

  return [...base, livePoint];
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
      historyStart: null,
      historyEnd: null
    };
  }

  const cutoff = range === "ALL" ? null : shiftDate(getToday(), -RANGE_DAYS[range]);
  const points = cutoff
    ? artist.priceHistory.filter((point) => point.date >= cutoff)
    : artist.priceHistory;

  return {
    points,
    hasRealHistory: false,
    historyStart: points[0]?.date ?? null,
    historyEnd: points[points.length - 1]?.date ?? null
  };
}

function normalizeRange(value: string | null): HistoryRange {
  if (value === "1M" || value === "3M" || value === "6M" || value === "1Y" || value === "ALL") {
    return value;
  }

  return "1M";
}

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);

  return value.toISOString().slice(0, 10);
}
