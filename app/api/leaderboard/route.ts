import { NextResponse } from "next/server";
import {
  createAnonServerClient,
  createServiceRoleClient,
  getSupabaseConfigStatus
} from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import type { LeaderboardEntry } from "@/lib/types";
import { getAdminEmails } from "@/server/admin-auth";

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

    const adminUserIds =
      config.serviceRoleConfigured && "auth" in supabase
        ? await loadAdminUserIds(supabase as ReturnType<typeof createServiceRoleClient>)
        : new Set<string>();

    return NextResponse.json({
      ok: true,
      source: "supabase",
      config,
      leaderboard: ((data ?? []) as LeaderboardRow[]).map((row) => mapLeaderboardEntry(row, adminUserIds))
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

async function loadAdminUserIds(supabase: ReturnType<typeof createServiceRoleClient>) {
  const adminEmails = new Set(getAdminEmails());
  const adminUserIds = new Set<string>();

  if (!adminEmails.size) {
    return adminUserIds;
  }

  const { data, error } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000
  });

  if (error) {
    return adminUserIds;
  }

  for (const user of data.users) {
    const email = user.email?.trim().toLowerCase();

    if (email && adminEmails.has(email)) {
      adminUserIds.add(user.id);
    }
  }

  return adminUserIds;
}

function mapLeaderboardEntry(row: LeaderboardRow, adminUserIds: Set<string>): LeaderboardEntry {
  return {
    id: row.user_id,
    username: row.username,
    portfolioValue: Number(row.portfolio_value),
    cashBalance: Number(row.cash_balance),
    gainPercent: Number(row.gain_percent),
    isAdmin: adminUserIds.has(row.user_id)
  };
}
