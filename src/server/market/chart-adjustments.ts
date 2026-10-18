import type { createServiceRoleClient } from "@/lib/supabase/server";
import { loadValuationBoundaries } from "@/server/market/valuation-boundaries";
import { roundPrice } from "@/lib/pricing";
import type { PriceHistoryAdjustment } from "@/lib/adjusted-price-history";
import { getMarketDate, getMarketDayBoundsUtc } from "@/server/market/market-date";

export async function loadChartAdjustments({ supabase, artistIds, earliestDate, intraday = false }: {
  supabase: ReturnType<typeof createServiceRoleClient>;
  artistIds: string[];
  earliestDate?: string;
  intraday?: boolean;
}): Promise<Record<string, PriceHistoryAdjustment[]>> {
  if (!artistIds.length) return {};
  const rows = await loadValuationBoundaries({ supabase, artistIds, startDate: earliestDate, endDate: getMarketDate() });
  const grouped: Record<string, PriceHistoryAdjustment[]> = {};
  for (const row of rows) {
    const record = row.record;
    let effectiveAt = record.effectiveAt;
    // Earlier corrections did not save their timestamp in the boundary.
    // Resolve it from the matching recorded quote, never from calendar midnight.
    if (intraday && !effectiveAt) {
      const before = row.priceBeforeRevaluation;
      if (!row.modelVersion || typeof before !== "number" || !Number.isFinite(before) || before <= 0) throw new Error("Correction timing is unavailable.");
      const bounds = getMarketDayBoundsUtc(record.effectiveDate);
      const tick = await supabase.from("price_ticks").select("observed_at")
        .eq("artist_id", row.artistId).eq("source", "market_run").eq("model_version", row.modelVersion)
        .eq("price", roundPrice(before * record.factor)).contains("raw_payload", { runDate: record.effectiveDate, intraday: false })
        .gte("observed_at", bounds.start).lt("observed_at", bounds.end)
        .order("observed_at").limit(1).maybeSingle();
      if (tick.error || !tick.data) throw new Error("The recorded correction tick could not be verified.");
      effectiveAt = tick.data.observed_at;
    }
    (grouped[row.artistId] ??= []).push({ effectiveDate: record.effectiveDate, factor: record.factor, ...(effectiveAt ? { effectiveAt } : {}) });
  }
  return grouped;
}
