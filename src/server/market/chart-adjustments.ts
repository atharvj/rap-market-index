import type { createServiceRoleClient } from "@/lib/supabase/server";
import { loadAllPages } from "@/lib/pagination";
import { roundPrice } from "@/lib/pricing";
import type { PriceHistoryAdjustment } from "@/lib/adjusted-price-history";
import { getMarketDate, getMarketDayBoundsUtc } from "@/server/market/market-date";
import { readAudienceRevaluation } from "@/server/market/audience-revaluation";

export async function loadChartAdjustments({ supabase, artistIds, earliestDate, intraday = false }: {
  supabase: ReturnType<typeof createServiceRoleClient>;
  artistIds: string[];
  earliestDate?: string;
  intraday?: boolean;
}): Promise<Record<string, PriceHistoryAdjustment[]>> {
  if (!artistIds.length) return {};
  const rows = await loadAllPages(async (from, to) => {
    let query = supabase.from("market_signal_snapshots").select("artist_id,source_date,model_version,raw_payload")
      .in("artist_id", artistIds).lte("source_date", getMarketDate())
      .not("raw_payload->audienceRevaluation", "is", null).order("source_date").order("artist_id");
    if (earliestDate) query = query.gte("source_date", earliestDate);
    const result = await query.range(from, to);
    if (result.error) throw new Error(`Could not load chart valuation changes: ${result.error.message}`);
    return result.data ?? [];
  });
  const grouped: Record<string, PriceHistoryAdjustment[]> = {};
  for (const row of rows) {
    const payload = row.raw_payload as Record<string, unknown> | null;
    const record = readAudienceRevaluation(payload?.audienceRevaluation, row.source_date);
    if (!record) continue;
    let effectiveAt = record.effectiveAt;
    // Earlier corrections did not save their timestamp in the boundary.
    // Resolve it from the matching recorded quote, never from calendar midnight.
    if (intraday && !effectiveAt) {
      const before = payload?.priceBeforeRevaluation;
      if (typeof before !== "number" || !Number.isFinite(before) || before <= 0) throw new Error("Correction timing is unavailable.");
      const bounds = getMarketDayBoundsUtc(record.effectiveDate);
      const tick = await supabase.from("price_ticks").select("observed_at")
        .eq("artist_id", row.artist_id).eq("source", "market_run").eq("model_version", row.model_version)
        .eq("price", roundPrice(before * record.factor)).contains("raw_payload", { runDate: record.effectiveDate, intraday: false })
        .gte("observed_at", bounds.start).lt("observed_at", bounds.end)
        .order("observed_at").limit(1).maybeSingle();
      if (tick.error || !tick.data) throw new Error("The recorded correction tick could not be verified.");
      effectiveAt = tick.data.observed_at;
    }
    (grouped[row.artist_id] ??= []).push({ effectiveDate: record.effectiveDate, factor: record.factor, ...(effectiveAt ? { effectiveAt } : {}) });
  }
  return grouped;
}
