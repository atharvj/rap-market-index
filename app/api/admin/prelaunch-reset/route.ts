import { NextResponse } from "next/server";
import { calculateHypeScore, roundPrice } from "@/lib/pricing";
import { createServiceRoleClient, getSupabaseConfigStatus } from "@/lib/supabase/server";
import { requireAdminRequest } from "@/server/admin-auth";
import { buildAudienceScaleCalibration } from "@/server/market/audience-scale";
import { getPacificMarketDate, shiftMarketDate } from "@/server/market/market-date";
import { getMarketModelVersion } from "@/server/market/model-version";
import { loadObservationBaselines } from "@/server/market/supabase-repository";
import type { HypeStats } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type ResetBody = {
  confirm?: string;
  startingCash?: number;
  resetWatchlists?: boolean;
  clearHalts?: boolean;
};

type DeleteTarget = {
  table: string;
  column: string;
};

type ResetArtist = {
  id: string;
  ticker: string;
  current_price: number;
};

type ResetCalibration = {
  artists: ResetArtist[];
  prices: Record<string, number>;
  coverage: Record<string, number>;
  targets: Array<{ artistId: string; ticker: string; price: number; coverage: number }>;
};

const CONFIRM_TEXT = "RESET RMI";
const DEFAULT_STARTING_CASH = 100_000;
const MAX_STARTING_CASH = 1_000_000_000;
const NEUTRAL_STATS: HypeStats = {
  streamingGrowth: 0,
  youtubeGrowth: 0,
  searchGrowth: 0,
  socialGrowth: 0,
  newsScore: 50,
  traderDemand: 0
};

const MARKET_DELETE_TARGETS: DeleteTarget[] = [
  { table: "short_transactions", column: "id" },
  { table: "transactions", column: "id" },
  { table: "short_positions", column: "user_id" },
  { table: "holdings", column: "user_id" },
  { table: "price_ticks", column: "id" },
  { table: "price_history", column: "id" },
  { table: "market_signal_snapshots", column: "id" },
  { table: "market_update_runs", column: "id" }
];

export async function GET(request: Request) {
  const auth = await requireAdminRequest(request, { allowMarketSecret: false });

  if (!auth.ok) {
    return auth.response;
  }

  return NextResponse.json({
    ok: true,
    confirmText: CONFIRM_TEXT,
    defaultStartingCash: DEFAULT_STARTING_CASH,
    config: getSupabaseConfigStatus()
  });
}

export async function POST(request: Request) {
  const auth = await requireAdminRequest(request, { allowMarketSecret: false });

  if (!auth.ok) {
    return auth.response;
  }

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

  const body = await parseBody(request);

  if (body.confirm !== CONFIRM_TEXT) {
    return NextResponse.json(
      {
        ok: false,
        error: `Type ${CONFIRM_TEXT} to reset the prelaunch market.`
      },
      { status: 400 }
    );
  }

  const startingCash = normalizeCash(body.startingCash);
  const supabase = createServiceRoleClient();
  const deleteTargets = body.resetWatchlists === true
    ? [...MARKET_DELETE_TARGETS, { table: "watchlist", column: "user_id" }]
    : MARKET_DELETE_TARGETS;
  const deletedRows: Record<string, number> = {};

  try {
    const calibration = await buildResetCalibration(supabase);

    for (const target of deleteTargets) {
      deletedRows[target.table] = await deleteAllRows(supabase, target);
    }

    if (body.clearHalts !== false) {
      deletedRows.artist_trading_halts = await deleteAllRows(supabase, {
        table: "artist_trading_halts",
        column: "artist_id"
      });
    }

    const resetProfileCount = await resetProfiles(supabase, startingCash);
    const resetArtistCount = await resetArtists(supabase, calibration);
    const resetDate = getPacificMarketDate();
    const seededHistoryCount = await seedResetHistory(supabase, calibration, resetDate);

    return NextResponse.json({
      ok: true,
      confirmText: CONFIRM_TEXT,
      startingCash,
      resetProfileCount,
      resetArtistCount,
      seededHistoryCount,
      calibratedPriceCount: calibration.targets.length,
      calibratedPriceRange: getPriceRange(calibration.targets),
      deletedRows,
      modelVersion: getMarketModelVersion(),
      note: "Prelaunch state reset. Every active quote now starts at its latest source-backed audience baseline with a zero daily change. Raw source observations and verified news were preserved."
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Prelaunch reset failed.",
        deletedRows
      },
      { status: 500 }
    );
  }
}

async function parseBody(request: Request): Promise<ResetBody> {
  try {
    return (await request.json()) as ResetBody;
  } catch {
    return {};
  }
}

function normalizeCash(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_STARTING_CASH;
  }

  return Math.round(Math.min(MAX_STARTING_CASH, Math.max(0, value)) * 100) / 100;
}

async function deleteAllRows(
  supabase: ReturnType<typeof createServiceRoleClient>,
  target: DeleteTarget
) {
  const client = supabase as unknown as {
    from: (table: string) => {
      delete: (options: { count: "exact" }) => {
        not: (column: string, operator: "is", value: null) => Promise<{ count: number | null; error: { message: string } | null }>;
      };
    };
  };
  const { count, error } = await client.from(target.table).delete({ count: "exact" }).not(target.column, "is", null);

  if (error) {
    throw new Error(`Could not reset ${target.table}: ${error.message}`);
  }

  return count ?? 0;
}

async function resetProfiles(supabase: ReturnType<typeof createServiceRoleClient>, startingCash: number) {
  const { error } = await supabase
    .from("profiles")
    .update({ cash_balance: startingCash })
    .not("id", "is", null);

  if (error) {
    throw new Error(`Could not reset profiles: ${error.message}`);
  }

  const { data, error: countError } = await supabase.from("profiles").select("id");

  if (countError) {
    throw new Error(`Could not count reset profiles: ${countError.message}`);
  }

  return data?.length ?? 0;
}

async function resetArtists(
  supabase: ReturnType<typeof createServiceRoleClient>,
  calibration: ResetCalibration
) {
  for (const artist of calibration.artists) {
    const safePrice = calibration.prices[artist.id];

    if (!safePrice) {
      throw new Error(`Missing a reset valuation for ${artist.ticker}.`);
    }

    const { error: updateError } = await supabase
      .from("artists")
      .update({
        current_price: safePrice,
        previous_close: safePrice,
        daily_change_percent: 0,
        hype_score: calculateHypeScore(NEUTRAL_STATS),
        last_move_explanation: `${artist.ticker} opened at its source-backed audience baseline.`
      })
      .eq("id", artist.id);

    if (updateError) {
      throw new Error(`Could not reset ${artist.ticker}: ${updateError.message}`);
    }
  }

  if (calibration.artists.length) {
    const { error: statsError } = await supabase.from("artist_stats").upsert(
      calibration.artists.map((artist) => ({
        artist_id: artist.id,
        streaming_growth: NEUTRAL_STATS.streamingGrowth,
        youtube_growth: NEUTRAL_STATS.youtubeGrowth,
        search_growth: NEUTRAL_STATS.searchGrowth,
        social_growth: NEUTRAL_STATS.socialGrowth,
        news_score: NEUTRAL_STATS.newsScore,
        trader_demand: NEUTRAL_STATS.traderDemand
      })),
      { onConflict: "artist_id" }
    );

    if (statsError) {
      throw new Error(`Could not reset artist stats: ${statsError.message}`);
    }
  }

  return calibration.artists.length;
}

async function buildResetCalibration(
  supabase: ReturnType<typeof createServiceRoleClient>
): Promise<ResetCalibration> {
  const { data, error } = await supabase
    .from("artists")
    .select("id,ticker,current_price")
    .eq("is_active", true)
    .order("id");

  if (error) {
    throw new Error(`Could not load artists for reset: ${error.message}`);
  }

  const artists = (data ?? []) as ResetArtist[];
  const artistIds = artists.map((artist) => artist.id);
  const beforeDate = shiftMarketDate(getPacificMarketDate(), 1);
  const [lastfm, youtube, wikimedia] = await Promise.all([
    loadObservationBaselines({
      supabase,
      artistIds,
      source: "lastfm",
      metrics: ["listeners", "playcount"],
      beforeDate,
      lookbackDays: 60,
      strategy: "latest"
    }),
    loadObservationBaselines({
      supabase,
      artistIds,
      source: "youtube",
      metrics: ["subscriber_count", "channel_views"],
      beforeDate,
      lookbackDays: 60,
      strategy: "latest"
    }),
    loadObservationBaselines({
      supabase,
      artistIds,
      source: "wikimedia",
      metrics: ["pageviews_7d"],
      beforeDate,
      lookbackDays: 60,
      strategy: "latest"
    })
  ]);
  const prices: Record<string, number> = {};
  const coverage: Record<string, number> = {};
  const targets: ResetCalibration["targets"] = [];
  const missing: string[] = [];

  for (const artist of artists) {
    const calibration = buildAudienceScaleCalibration({
      stats: {},
      rawPayload: {
        lastfm: {
          listeners: lastfm[artist.id]?.listeners,
          playcount: lastfm[artist.id]?.playcount
        },
        youtube: {
          subscriberCount: youtube[artist.id]?.subscriber_count,
          viewCount: youtube[artist.id]?.channel_views
        },
        wikimedia: {
          pageviews7d: wikimedia[artist.id]?.pageviews_7d
        }
      }
    });

    if (calibration.status !== "ok" || !calibration.targetPrice) {
      missing.push(artist.ticker);
      continue;
    }

    const price = roundPrice(calibration.targetPrice);
    prices[artist.id] = price;
    coverage[artist.id] = calibration.coverage;
    targets.push({ artistId: artist.id, ticker: artist.ticker, price, coverage: calibration.coverage });
  }

  if (missing.length) {
    throw new Error(
      `Reset stopped before deleting data because ${missing.length} active artist${missing.length === 1 ? "" : "s"} ` +
      `lack enough direct audience evidence: ${missing.join(", ")}.`
    );
  }

  return { artists, prices, coverage, targets };
}

async function seedResetHistory(
  supabase: ReturnType<typeof createServiceRoleClient>,
  calibration: ResetCalibration,
  resetDate: string
) {
  const modelVersion = getMarketModelVersion();
  const historyRows = calibration.artists.map((artist) => ({
    artist_id: artist.id,
    price_date: resetDate,
    price: calibration.prices[artist.id],
    hype_score: calculateHypeScore(NEUTRAL_STATS),
    model_version: modelVersion,
    explanation: `${artist.ticker} opened at its source-backed audience baseline.`
  }));
  const { error: historyError } = await supabase.from("price_history").insert(historyRows);

  if (historyError) {
    throw new Error(`Could not seed reset price history: ${historyError.message}`);
  }

  const { error: tickError } = await supabase.from("price_ticks").insert(
    calibration.artists.map((artist) => ({
      artist_id: artist.id,
      price: calibration.prices[artist.id],
      source: "manual",
      model_version: modelVersion,
      raw_payload: {
        reason: "prelaunch_source_backed_reset",
        audienceScaleCoverage: calibration.coverage[artist.id]
      }
    }))
  );

  if (tickError) {
    throw new Error(`Could not seed reset price ticks: ${tickError.message}`);
  }

  return historyRows.length;
}

function getPriceRange(targets: ResetCalibration["targets"]) {
  const prices = targets.map((target) => target.price);

  return {
    min: prices.length ? Math.min(...prices) : null,
    max: prices.length ? Math.max(...prices) : null
  };
}
