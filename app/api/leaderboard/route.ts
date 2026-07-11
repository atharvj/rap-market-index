import { NextResponse } from "next/server";
import {
  createServiceRoleClient,
  getSupabaseConfigStatus
} from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import type { LeaderboardEntry } from "@/lib/types";

export const dynamic = "force-dynamic";

type LeaderboardRow = Database["public"]["Views"]["market_leaderboard"]["Row"];
const CACHE_HEADERS = { "Cache-Control": "public, max-age=5, s-maxage=15, stale-while-revalidate=30" };

export async function GET() {
  const config = getSupabaseConfigStatus();

  if (!config.readyForPublicReads) {
    return NextResponse.json({
      ok: true,
      source: "mock",
      leaderboard: []
    }, { headers: CACHE_HEADERS });
  }

  if (!config.serviceRoleConfigured) {
    return NextResponse.json(
      { ok: false, source: "supabase", error: "Rankings are temporarily unavailable." },
      { status: 503, headers: CACHE_HEADERS }
    );
  }

  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from("market_leaderboard")
      .select("*")
      .order("portfolio_value", { ascending: false })
      .limit(250);

    if (error) {
      throw new Error(`Could not load leaderboard: ${error.message}`);
    }

    const leaderboardRows = (data ?? []) as LeaderboardRow[];
    const { data: profiles, error: profilesError } = leaderboardRows.length
      ? await supabase
          .from("profiles")
          .select("id,profile_is_public,portfolio_is_public,is_admin")
          .in("id", leaderboardRows.map((row) => row.user_id))
          .eq("profile_is_public", true)
      : { data: [], error: null };

    if (profilesError) {
      throw new Error(`Could not load public leaderboard profiles: ${profilesError.message}`);
    }

    const profileMetadata = new Map(
      (profiles ?? []).map((profile) => [profile.id, {
        isAdmin: profile.is_admin,
        portfolioIsPublic: profile.portfolio_is_public
      }])
    );
    const visibleRows = leaderboardRows
      .filter((row) => profileMetadata.has(row.user_id))
      .slice(0, 100);

    return NextResponse.json({
      ok: true,
      source: "supabase",
      leaderboard: visibleRows.map((row) => mapLeaderboardEntry(row, profileMetadata.get(row.user_id)!))
    }, { headers: CACHE_HEADERS });
  } catch (error) {
    console.error("Leaderboard request failed", error);
    return NextResponse.json(
      {
        ok: false,
        source: "supabase",
        error: "Rankings are temporarily unavailable."
      },
      { status: 500, headers: CACHE_HEADERS }
    );
  }
}

function mapLeaderboardEntry(
  row: LeaderboardRow,
  metadata: { isAdmin: boolean; portfolioIsPublic: boolean }
): LeaderboardEntry {
  return {
    id: row.user_id,
    username: row.username,
    portfolioValue: Number(row.portfolio_value),
    cashBalance: metadata.portfolioIsPublic ? Number(row.cash_balance) : 0,
    gainPercent: Number(row.gain_percent),
    isAdmin: metadata.isAdmin,
    portfolioIsPublic: metadata.portfolioIsPublic
  };
}
