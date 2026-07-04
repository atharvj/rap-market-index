import { NextResponse } from "next/server";
import {
  createAnonServerClient,
  createServiceRoleClient,
  getSupabaseConfigStatus
} from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import type { LeaderboardEntry } from "@/lib/types";

export const dynamic = "force-dynamic";

type LeaderboardRow = Database["public"]["Views"]["market_leaderboard"]["Row"];

export async function GET() {
  const config = getSupabaseConfigStatus();

  if (!config.readyForPublicReads) {
    return NextResponse.json({
      ok: true,
      source: "mock",
      config,
      leaderboard: []
    });
  }

  try {
    const supabase = config.serviceRoleConfigured ? createServiceRoleClient() : createAnonServerClient();
    const { data, error } = await supabase
      .from("market_leaderboard")
      .select("*")
      .order("portfolio_value", { ascending: false })
      .limit(100);

    if (error) {
      throw new Error(`Could not load leaderboard: ${error.message}`);
    }

    return NextResponse.json({
      ok: true,
      source: "supabase",
      config,
      leaderboard: ((data ?? []) as LeaderboardRow[]).map(mapLeaderboardEntry)
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        source: "supabase",
        config,
        error: error instanceof Error ? error.message : "Could not load leaderboard."
      },
      { status: 500 }
    );
  }
}

function mapLeaderboardEntry(row: LeaderboardRow): LeaderboardEntry {
  return {
    id: row.user_id,
    username: row.username,
    portfolioValue: Number(row.portfolio_value),
    cashBalance: Number(row.cash_balance),
    gainPercent: Number(row.gain_percent)
  };
}
