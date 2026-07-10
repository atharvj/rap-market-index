import { NextResponse } from "next/server";
import { calculateHypeScore } from "@/lib/pricing";
import { createServiceRoleClient, getSupabaseConfigStatus } from "@/lib/supabase/server";
import { requireAdminRequest } from "@/server/admin-auth";
import { getMarketModelVersion } from "@/server/market/model-version";
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
  { table: "market_events", column: "id" },
  { table: "market_observations", column: "id" },
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
    const resetArtistCount = await resetArtists(supabase);

    return NextResponse.json({
      ok: true,
      confirmText: CONFIRM_TEXT,
      startingCash,
      resetProfileCount,
      resetArtistCount,
      deletedRows,
      modelVersion: getMarketModelVersion(),
      note: "Prelaunch state reset. Run the market once to seed fresh price history from current source-backed data."
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

async function resetArtists(supabase: ReturnType<typeof createServiceRoleClient>) {
  const { data: artists, error } = await supabase
    .from("artists")
    .select("id,ticker,current_price")
    .eq("is_active", true);

  if (error) {
    throw new Error(`Could not load artists for reset: ${error.message}`);
  }

  const activeArtists = artists ?? [];

  for (const artist of activeArtists) {
    const currentPrice = Number(artist.current_price);
    const safePrice = Number.isFinite(currentPrice) && currentPrice > 0 ? currentPrice : 1;
    const { error: updateError } = await supabase
      .from("artists")
      .update({
        previous_close: safePrice,
        daily_change_percent: 0,
        hype_score: calculateHypeScore(NEUTRAL_STATS),
        last_move_explanation: `${artist.ticker} is waiting for fresh source-backed market data.`
      })
      .eq("id", artist.id);

    if (updateError) {
      throw new Error(`Could not reset ${artist.ticker}: ${updateError.message}`);
    }
  }

  if (activeArtists.length) {
    const { error: statsError } = await supabase.from("artist_stats").upsert(
      activeArtists.map((artist) => ({
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

  return activeArtists.length;
}
