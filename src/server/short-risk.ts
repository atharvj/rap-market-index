import type { createServiceRoleClient } from "@/lib/supabase/server";
import { SHORT_MAINTENANCE_MARGIN_PERCENT } from "@/lib/trading";

type ServiceSupabase = ReturnType<typeof createServiceRoleClient>;

export type ShortLiquidationSummary = {
  inspected: number;
  liquidated: number;
  failures: number;
};

export async function liquidateUnderMarginedShorts(
  supabase: ServiceSupabase,
  { userId }: { userId?: string } = {}
): Promise<ShortLiquidationSummary> {
  let query = supabase
    .from("short_position_risk")
    .select("user_id,artist_id,shares,equity_percent")
    .lte("equity_percent", SHORT_MAINTENANCE_MARGIN_PERCENT)
    .order("equity_percent", { ascending: true })
    .limit(500);

  if (userId) {
    query = query.eq("user_id", userId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Could not inspect short-position margin: ${error.message}`);
  }

  let liquidated = 0;
  let failures = 0;

  for (const position of data ?? []) {
    const shares = Math.floor(Number(position.shares));

    if (!Number.isFinite(shares) || shares <= 0) {
      failures += 1;
      continue;
    }

    const result = await supabase.rpc("execute_artist_trade_as_user", {
      p_user_id: position.user_id,
      p_side: "cover",
      p_artist_id: position.artist_id,
      p_shares: shares,
      p_market_eligible: false
    });

    if (result.error) {
      failures += 1;
    } else {
      liquidated += 1;
    }
  }

  return {
    inspected: data?.length ?? 0,
    liquidated,
    failures
  };
}
