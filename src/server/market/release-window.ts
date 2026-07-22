import "server-only";
import type { createServiceRoleClient } from "@/lib/supabase/server";
import { getMarketDate } from "@/server/market/market-date";

export const RELEASE_WINDOW_REASON =
  "Trading is paused while today’s release scan and source-based repricing finish.";

export type ReleaseWindowStatus = {
  marketDate: string;
  ready: boolean;
  reason: string;
};

export async function loadReleaseWindowStatus(
  supabase: ReturnType<typeof createServiceRoleClient>,
  now = new Date()
): Promise<ReleaseWindowStatus> {
  const marketDate = getMarketDate(now);
  const [runResult, artistCountResult, historyCountResult] = await Promise.all([
    supabase
      .from("market_update_runs")
      .select("run_date,status,source")
      .eq("run_date", marketDate)
      .eq("status", "succeeded")
      .eq("source", "core")
      .maybeSingle(),
    supabase
      .from("artists")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),
    supabase
      .from("price_history")
      .select("artist_id", { count: "exact", head: true })
      .eq("price_date", marketDate)
  ]);

  const error = runResult.error ?? artistCountResult.error ?? historyCountResult.error;

  if (error) {
    throw new Error(`Could not verify today's market release window: ${error.message}`);
  }

  const activeArtistCount = artistCountResult.count ?? 0;
  const completedArtistCount = historyCountResult.count ?? 0;
  const ready = Boolean(
    runResult.data
    && activeArtistCount > 0
    && completedArtistCount >= activeArtistCount
  );

  return {
    marketDate,
    ready,
    reason: ready ? "Today’s source-based market update is complete." : RELEASE_WINDOW_REASON
  };
}
