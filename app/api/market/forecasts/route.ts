import { NextResponse } from "next/server";
import { createServiceRoleClient, getSupabaseConfigStatus } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import type { MarketForecast } from "@/lib/types";
import { getMarketDate, shiftMarketDate } from "@/server/market/market-date";
import { buildPublicMarketForecasts } from "@/server/market/polymarket-forecasts";
import { reportServerError } from "@/server/observability";

export const dynamic = "force-dynamic";

type ObservationRow = Pick<
  Database["public"]["Tables"]["market_observations"]["Row"],
  "artist_id" | "observed_date" | "raw_payload"
>;

const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=1800"
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const artistId = normalizeArtistId(url.searchParams.get("artistId"));
  const limit = normalizeLimit(url.searchParams.get("limit"));
  const config = getSupabaseConfigStatus();

  if (!config.readyForPublicReads) {
    return NextResponse.json({
      ok: true,
      source: "mock",
      forecasts: [],
      asOf: null
    }, { headers: CACHE_HEADERS });
  }

  if (!config.serviceRoleConfigured) {
    return NextResponse.json(
      { ok: false, error: "Crowd forecasts are temporarily unavailable." },
      { status: 503, headers: CACHE_HEADERS }
    );
  }

  try {
    const supabase = createServiceRoleClient();
    let artistQuery = supabase
      .from("artists")
      .select("id")
      .eq("is_active", true);

    if (artistId) {
      artistQuery = artistQuery.eq("id", artistId);
    }

    const { data: artists, error: artistError } = await artistQuery;

    if (artistError) {
      throw new Error(`Could not load forecast artists: ${artistError.message}`);
    }

    const artistIds = (artists ?? []).map((artist) => artist.id);

    if (artistId && !artistIds.length) {
      return NextResponse.json(
        { ok: false, error: "Artist not found." },
        { status: 404, headers: CACHE_HEADERS }
      );
    }

    if (!artistIds.length) {
      return NextResponse.json({
        ok: true,
        source: "polymarket",
        forecasts: [],
        asOf: null
      }, { headers: CACHE_HEADERS });
    }

    const { data, error } = await supabase
      .from("market_observations")
      .select("artist_id,observed_date,raw_payload")
      .in("artist_id", artistIds)
      .eq("source", "polymarket")
      .eq("metric", "music_market_contract_count")
      .gte("observed_date", shiftMarketDate(getMarketDate(), -14))
      .order("observed_date", { ascending: false })
      .limit(Math.min(2000, Math.max(100, artistIds.length * 14)));

    if (error) {
      throw new Error(`Could not load crowd forecasts: ${error.message}`);
    }

    const latestByArtist = ((data ?? []) as ObservationRow[]).reduce<Record<string, ObservationRow>>(
      (memo, row) => {
        memo[row.artist_id] ??= row;
        return memo;
      },
      {}
    );
    const forecasts = Object.values(latestByArtist)
      .flatMap((row) =>
        buildPublicMarketForecasts({
          artistId: row.artist_id,
          observedDate: row.observed_date,
          rawPayload:
            row.raw_payload && typeof row.raw_payload === "object" && !Array.isArray(row.raw_payload)
              ? row.raw_payload as Record<string, unknown>
              : {},
          limit: artistId ? limit : 12
        })
      )
      .sort((first, second) => second.insightScore - first.insightScore);
    const selected = artistId ? forecasts.slice(0, limit) : selectDiverseForecasts(forecasts, limit);
    const asOf = selected.map((forecast) => forecast.asOf).sort().at(-1) ?? null;

    return NextResponse.json({
      ok: true,
      source: "polymarket",
      forecasts: selected,
      asOf
    }, { headers: CACHE_HEADERS });
  } catch (error) {
    reportServerError(error, "market.forecasts");
    return NextResponse.json(
      {
        ok: false,
        source: "polymarket",
        error: "Crowd forecasts are temporarily unavailable."
      },
      { status: 500, headers: CACHE_HEADERS }
    );
  }
}

function selectDiverseForecasts(forecasts: MarketForecast[], limit: number) {
  const selected: MarketForecast[] = [];
  const selectedIds = new Set<string>();
  const artistIds = new Set<string>();

  for (const forecast of forecasts) {
    if (selected.length >= limit) {
      break;
    }

    if (!artistIds.has(forecast.artistId)) {
      selected.push(forecast);
      selectedIds.add(forecast.id);
      artistIds.add(forecast.artistId);
    }
  }

  for (const forecast of forecasts) {
    if (selected.length >= limit) {
      break;
    }

    if (!selectedIds.has(forecast.id)) {
      selected.push(forecast);
      selectedIds.add(forecast.id);
    }
  }

  return selected;
}

function normalizeArtistId(value: string | null) {
  const normalized = value?.trim();

  return normalized && /^[a-z0-9][a-z0-9-]{0,99}$/i.test(normalized)
    ? normalized
    : null;
}

function normalizeLimit(value: string | null) {
  const parsed = Number.parseInt(value ?? "", 10);

  return Number.isFinite(parsed) ? Math.min(12, Math.max(1, parsed)) : 6;
}
