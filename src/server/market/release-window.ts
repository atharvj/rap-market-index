import "server-only";
import { loadAllPages } from "@/lib/pagination";
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
  const [runResult, activeArtists] = await Promise.all([
    supabase
      .from("market_update_runs")
      .select("run_date,status,source")
      .eq("run_date", marketDate)
      .eq("status", "succeeded")
      .eq("source", "core")
      .maybeSingle(),
    loadAllPages(async (from, to) => {
      const { data, error } = await supabase.from("artists").select("id")
        .eq("is_active", true).order("id").range(from, to);
      if (error) throw new Error(`Could not verify active market artists: ${error.message}`);
      return data ?? [];
    })
  ]);

  if (runResult.error) {
    throw new Error(`Could not verify today's market release window: ${runResult.error.message}`);
  }

  const artistIds = activeArtists.map(artist => artist.id);
  let ready = false;
  if (runResult.data && artistIds.length) {
    const { count, error } = await supabase.from("price_history")
      .select("artist_id", { count: "exact", head: true })
      .eq("price_date", marketDate).in("artist_id", artistIds);
    if (error) throw new Error(`Could not verify today's active artist closes: ${error.message}`);
    // Inactive listings must not hide an active artist missing today's close.
    ready = count === artistIds.length;
  }

  return {
    marketDate,
    ready,
    reason: ready ? "Today’s source-based market update is complete." : RELEASE_WINDOW_REASON
  };
}
