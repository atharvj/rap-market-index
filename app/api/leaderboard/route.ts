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
const CACHE_HEADERS = { "Cache-Control": "public, max-age=5, s-maxage=15, stale-while-revalidate=30" };

export async function GET(request: Request) {
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
    const requesterId = await getRequesterId(request);
    const responseHeaders = requesterId
      ? { "Cache-Control": "private, no-store", Vary: "Authorization" }
      : CACHE_HEADERS;
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
          .select("id,avatar_url,profile_is_public,portfolio_is_public,is_admin")
          .in("id", leaderboardRows.map((row) => row.user_id))
          .eq("profile_is_public", true)
      : { data: [], error: null };

    if (profilesError) {
      throw new Error(`Could not load public leaderboard profiles: ${profilesError.message}`);
    }

    const profileMetadata = new Map(
      (profiles ?? []).map((profile) => [profile.id, {
        avatarUrl: profile.avatar_url,
        isAdmin: profile.is_admin,
        portfolioIsPublic: profile.portfolio_is_public
      }])
    );
    const visibleRows = leaderboardRows
      .filter((row) => profileMetadata.has(row.user_id))
      .slice(0, 100);
    const visibleLeaderboard = visibleRows.map((row, index) => ({
      ...mapLeaderboardEntry(row, profileMetadata.get(row.user_id)!),
      rank: index + 1
    }));

    if (requesterId && !visibleLeaderboard.some((entry) => entry.id === requesterId)) {
      const [{ data: requesterRow }, { data: requesterProfile }] = await Promise.all([
        supabase.from("market_leaderboard").select("*").eq("user_id", requesterId).maybeSingle(),
        supabase.from("profiles").select("id,avatar_url,portfolio_is_public,is_admin").eq("id", requesterId).maybeSingle()
      ]);

      if (requesterRow && requesterProfile) {
        const { count } = await supabase
          .from("market_leaderboard")
          .select("user_id", { count: "exact", head: true })
          .gt("portfolio_value", requesterRow.portfolio_value);

        visibleLeaderboard.push({
          ...mapLeaderboardEntry(requesterRow as LeaderboardRow, {
            avatarUrl: requesterProfile.avatar_url,
            isAdmin: requesterProfile.is_admin,
            portfolioIsPublic: requesterProfile.portfolio_is_public
          }),
          rank: (count ?? 0) + 1
        });
      }
    }

    return NextResponse.json({
      ok: true,
      source: "supabase",
      leaderboard: visibleLeaderboard
    }, { headers: responseHeaders });
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

async function getRequesterId(request: Request) {
  const authorization = request.headers.get("authorization");

  if (!authorization) {
    return null;
  }

  const { data, error } = await createAnonServerClient(authorization).auth.getUser();
  return error || !data.user?.email_confirmed_at ? null : data.user.id;
}

function mapLeaderboardEntry(
  row: LeaderboardRow,
  metadata: { avatarUrl: string | null; isAdmin: boolean; portfolioIsPublic: boolean }
): LeaderboardEntry {
  return {
    id: row.user_id,
    username: row.username,
    avatarUrl: metadata.avatarUrl ?? "",
    portfolioValue: Number(row.portfolio_value),
    cashBalance: metadata.portfolioIsPublic ? Number(row.cash_balance) : 0,
    gainPercent: Number(row.gain_percent),
    isAdmin: metadata.isAdmin,
    portfolioIsPublic: metadata.portfolioIsPublic
  };
}
