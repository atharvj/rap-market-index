import { parseTradingStatus, type TradingStatusRow } from "@/server/market/trading-status";
import { NextResponse } from "next/server";
import { createAnonServerClient, createServiceRoleClient, getSupabaseConfigStatus } from "@/lib/supabase/server";
import { getMarketDate } from "@/server/market/market-date";
import { loadReleaseWindowStatus } from "@/server/market/release-window";
import { reportServerError } from "@/server/observability";

export const dynamic = "force-dynamic";


const CACHE_HEADERS = { "Cache-Control": "public, max-age=5, s-maxage=15, stale-while-revalidate=30" };

export async function GET(request: Request) {
  const config = getSupabaseConfigStatus();
  const url = new URL(request.url);
  const artistId = url.searchParams.get("artistId");

  if (!config.readyForPublicReads) {
    return NextResponse.json({
      ok: true,
      source: "mock",
      status: buildFallbackStatus({ artistId })
    }, { headers: CACHE_HEADERS });
  }

  try {
    const supabase = createAnonServerClient();
    const { data, error } = await supabase.rpc("get_market_trading_status", {
      p_artist_id: artistId
    });

    if (error) {
      throw new Error(error.message);
    }

    const row = parseTradingStatus(data);
    if (!row) throw new Error("Trading controls returned an invalid status.");

    const status = buildStatus(row, { artistId });

    if (config.serviceRoleConfigured) {
      const releaseWindow = await loadReleaseWindowStatus(createServiceRoleClient());

      if (!releaseWindow.ready) {
        status.marketDate = releaseWindow.marketDate;
        status.isOpen = false;
        status.marketImpactEnabled = false;
        status.statusNote = releaseWindow.reason;
      }
    }

    return NextResponse.json({
      ok: true,
      source: "supabase",
      status
    }, { headers: CACHE_HEADERS });
  } catch (error) {
    reportServerError(error, "market.status");
    return NextResponse.json({
      ok: false,
      source: "fallback",
      warning: "Market status is temporarily unavailable.",
      status: buildUnavailableStatus({ artistId })
    }, { status: 503, headers: CACHE_HEADERS });
  }
}

function buildUnavailableStatus({ artistId }: { artistId: string | null }) {
  return {
    ...buildFallbackStatus({ artistId }),
    isOpen: false,
    marketImpactEnabled: false,
    statusNote: "Trading is temporarily paused while market status is unavailable."
  };
}

function buildStatus(row: TradingStatusRow, { artistId }: { artistId: string | null }) {
  const fallback = buildFallbackStatus({ artistId });

  return {
    ...fallback,
    tradingMode: row.trading_mode,
    isOpen: row.market_open && !row.artist_halted,
    marketImpactEnabled: row.market_impact_enabled,
    artistHalted: row.artist_halted,
    statusNote: row.reason
  };
}

function buildFallbackStatus({ artistId }: { artistId: string | null }) {
  return {
    marketDate: getMarketDate(),
    tradingMode: "continuous",
    isOpen: true,
    marketImpactEnabled: true,
    artistHalted: false,
    artistId,
    dayChangeReset: "12:01 AM ET",
    supportsShorting: true,
    statusNote: "Continuous virtual trading is open.",
    mechanics: {
      dailyAnchor: "Daily source-based repricing creates the previous-close anchor.",
      intraday: "Eligible trades can move the live quote within capped virtual-specialist limits.",
      execution: "Orders fill against a synthetic bid/ask quote with commission and slippage."
    }
  };
}
