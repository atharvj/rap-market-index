import { NextResponse } from "next/server";
import { createAnonServerClient, getSupabaseConfigStatus } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { getPacificMarketDate, shiftMarketDate } from "@/server/market/market-date";
import { getArtistStatusSubtype } from "@/server/market/status-events";

export const dynamic = "force-dynamic";

type ArtistRow = Pick<Database["public"]["Tables"]["artists"]["Row"], "id" | "name" | "ticker">;
type MarketEventRow = Database["public"]["Tables"]["market_events"]["Row"];
type MarketNewsType = Database["public"]["Tables"]["market_events"]["Row"]["event_type"];

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
    const supabase = createAnonServerClient();
    const artists = await loadArtists(supabase);
    const artistById = new Map(artists.map((artist) => [artist.id, artist]));
    const selectedArtistId = artistId ?? (ticker ? artists.find((artist) => artist.ticker === ticker)?.id ?? null : null);
    let query = supabase
      .from("market_events")
      .select("*")
      .gte("event_date", shiftMarketDate(runDate, -lookbackDays))
      .lte("event_date", runDate)
      .order("event_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit);

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

    const events = ((data ?? []) as MarketEventRow[]).map((event) => {
      const artist = artistById.get(event.artist_id) ?? null;
      const rawPayload = event.raw_payload as Record<string, unknown>;

      return {
        id: event.id,
        artistId: event.artist_id,
        artistName: artist?.name ?? event.artist_id,
        ticker: artist?.ticker ?? event.artist_id,
        eventDate: event.event_date,
        eventType: event.event_type,
        title: event.title,
        sourceName: event.source_name,
        sourceUrl: event.source_url,
        sentimentScore: Number(event.sentiment_score),
        impactScore: Number(event.impact_score),
        confidence: Number(event.confidence),
        statusSubtype: getArtistStatusSubtype(rawPayload.statusSubtype),
        statusSeverity: typeof rawPayload.statusSeverity === "string" ? rawPayload.statusSeverity : null,
        createdAt: event.created_at
      };
    });

    return NextResponse.json({
      ok: true,
      source: "supabase",
      runDate,
      lookbackDays,
      eventCount: events.length,
      news: events
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
    .select("id,name,ticker")
    .eq("is_active", true);

  if (error) {
    throw new Error(`Could not load artists for market news: ${error.message}`);
  }

  return (data ?? []) as ArtistRow[];
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
