import { NextResponse } from "next/server";
import { createServiceRoleClient, getSupabaseConfigStatus } from "@/lib/supabase/server";
import {
  flattenEvents,
  normalizeManualMarketEventList,
  type ManualMarketEventInput
} from "@/server/market/event-signals";
import { loadActiveArtists, loadRecentMarketEvents, persistMarketEvents } from "@/server/market/supabase-repository";

export const dynamic = "force-dynamic";

type MarketEventsBody = {
  events?: ManualMarketEventInput[];
  runDate?: string;
};

export async function GET(request: Request) {
  const config = getSupabaseConfigStatus();

  if (!config.readyForAdminWrites) {
    return NextResponse.json(
      {
        ok: false,
        error: "Supabase admin credentials are not fully configured.",
        config
      },
      { status: 400 }
    );
  }

  try {
    const url = new URL(request.url);
    const artistId = url.searchParams.get("artistId");
    const ticker = url.searchParams.get("ticker");
    const runDate = url.searchParams.get("runDate") ?? getToday();
    const lookbackDays = getInteger(url.searchParams.get("lookbackDays"), 30, 1, 365);
    const supabase = createServiceRoleClient();
    const artists = await loadActiveArtists(supabase);
    const filteredArtists = artists.filter((artist) => {
      if (artistId) {
        return artist.id === artistId;
      }

      if (ticker) {
        return artist.ticker === ticker.toUpperCase();
      }

      return true;
    });
    const eventsByArtist = await loadRecentMarketEvents({
      supabase,
      artistIds: filteredArtists.map((artist) => artist.id),
      runDate,
      lookbackDays
    });

    return NextResponse.json({
      ok: true,
      config,
      eventCount: Object.values(eventsByArtist).reduce((total, events) => total + events.length, 0),
      eventsByArtist
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: formatMarketEventError(error),
        config
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const config = getSupabaseConfigStatus();
  const secret = process.env.MARKET_UPDATE_SECRET;
  const providedSecret = request.headers.get("x-market-update-secret");

  if (!secret || providedSecret !== secret) {
    return NextResponse.json(
      {
        ok: false,
        error: "Missing or invalid market event secret."
      },
      { status: 401 }
    );
  }

  if (!config.readyForAdminWrites) {
    return NextResponse.json(
      {
        ok: false,
        error: "Supabase admin credentials are not fully configured.",
        config
      },
      { status: 400 }
    );
  }

  try {
    const body = await parseBody(request);
    const runDate = body.runDate ?? getToday();
    const supabase = createServiceRoleClient();
    const artists = await loadActiveArtists(supabase);
    const events = flattenEvents(
      normalizeManualMarketEventList({
        events: body.events,
        artists,
        runDate
      })
    );

    if (!events.length) {
      return NextResponse.json(
        {
          ok: false,
          error: "No valid market events were provided.",
          config
        },
        { status: 400 }
      );
    }

    await persistMarketEvents(supabase, events);

    return NextResponse.json({
      ok: true,
      config,
      savedEventCount: events.length,
      events
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: formatMarketEventError(error),
        config
      },
      { status: 500 }
    );
  }
}

async function parseBody(request: Request): Promise<MarketEventsBody> {
  try {
    return (await request.json()) as MarketEventsBody;
  } catch {
    return {};
  }
}

function getInteger(value: string | null, fallback: number, min: number, max: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function formatMarketEventError(error: unknown) {
  const message = error instanceof Error ? error.message : "Market event request failed.";
  const normalized = message.toLowerCase();

  if (normalized.includes("market_events") || normalized.includes("schema cache")) {
    return "Market event storage needs setup. Run supabase/migrations/007_market_events.sql in Supabase.";
  }

  return message;
}
