import type { createServiceRoleClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import { loadAllPages } from "@/lib/pagination";
import { readAudienceRevaluation, type AudienceRevaluation } from "@/server/market/audience-revaluation";

type Client = ReturnType<typeof createServiceRoleClient>;
export type StoredValuationBoundary = { artistId: string; sourceDate: string; modelVersion: string | null;
  record: AudienceRevaluation; priceBeforeRevaluation?: number };

/** Permanent correction records survive refreshes without replacing original daily evidence. */
export async function loadValuationBoundaries({ supabase, artistIds, startDate, endDate }: {
  supabase: Client; artistIds: string[]; startDate?: string; endDate: string;
}): Promise<StoredValuationBoundary[]> {
  if (!artistIds.length) return [];
  const [saved, legacy] = await Promise.all([
    loadAllPages(async (from, to) => {
      let query = supabase.from("market_valuation_boundaries")
        .select("artist_id,effective_date,effective_at,model_version,reference_price,anchor_price,factor,calibration")
        .in("artist_id", artistIds).lte("effective_date", endDate).order("effective_date").order("artist_id");
      if (startDate) query = query.gte("effective_date", startDate);
      const result = await query.range(from, to);
      if (result.error) throw new Error(`Could not load permanent valuation corrections: ${result.error.message}`);
      return result.data ?? [];
    }),
    loadAllPages(async (from, to) => {
      let query = supabase.from("market_signal_snapshots").select("artist_id,source_date,model_version,raw_payload")
        .in("artist_id", artistIds).lte("source_date", endDate)
        .not("raw_payload->audienceRevaluation", "is", null).order("source_date").order("artist_id");
      if (startDate) query = query.gte("source_date", startDate);
      const result = await query.range(from, to);
      if (result.error) throw new Error(`Could not load legacy valuation corrections: ${result.error.message}`);
      return result.data ?? [];
    })
  ]);
  const byKey = new Map<string, StoredValuationBoundary>();
  for (const row of legacy) {
    const raw = row.raw_payload as Record<string, unknown> | null;
    const record = readAudienceRevaluation(raw?.audienceRevaluation, row.source_date);
    if (!record) throw new Error("Could not verify a legacy valuation correction.");
    byKey.set(`${row.artist_id}:${row.source_date}`, { artistId: row.artist_id, sourceDate: row.source_date,
      modelVersion: row.model_version, record,
      ...(typeof raw?.priceBeforeRevaluation === "number" ? { priceBeforeRevaluation: raw.priceBeforeRevaluation } : {}) });
  }
  for (const row of saved) {
    const record = readAudienceRevaluation({ version: 2, effectiveDate: row.effective_date, effectiveAt: row.effective_at,
      referencePrice: Number(row.reference_price), anchorPrice: Number(row.anchor_price), factor: Number(row.factor),
      calibration: row.calibration as Json }, row.effective_date);
    if (!record) throw new Error("Could not verify a permanent valuation correction.");
    const key = `${row.artist_id}:${row.effective_date}`, prior = byKey.get(key)?.record;
    if (prior && (Math.abs(prior.factor - record.factor) > 0.000001 || prior.referencePrice !== record.referencePrice)) {
      throw new Error("Conflicting valuation corrections cannot be applied.");
    }
    byKey.set(key, { artistId: row.artist_id, sourceDate: row.effective_date, modelVersion: row.model_version, record });
  }
  return [...byKey.values()].sort((a, b) => a.sourceDate.localeCompare(b.sourceDate) || a.artistId.localeCompare(b.artistId));
}
