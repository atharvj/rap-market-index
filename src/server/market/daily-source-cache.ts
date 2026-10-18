import type { AdapterSignal, AdapterSignals } from "@/server/market/market-data";
import { isRedditAccessEnabled } from "@/server/market/reddit-access";

const DAILY_SOURCES = new Set([
  "gdelt", "listenbrainz", "spotify", "spotify_public", "wikimedia",
  "reddit", "bluesky", "youtube_comments", "apple_charts"
]);

// Save each source independently, including confidence and its market-wide
// calibration. A subset refresh must retain the original market context.
export function captureDailySources(sources: Array<AdapterSignals | undefined>) {
  const captured: Record<string, Record<string, AdapterSignal>> = {};
  for (const signals of sources) {
    for (const [artistId, signal] of Object.entries(signals ?? {})) {
      const source = signal.rawPayload.source;
      if (typeof source === "string" && DAILY_SOURCES.has(source)) {
        captured[artistId] ??= {};
        captured[artistId][source] = signal;
      }
    }
  }
  return captured;
}

export function restoreDailySources(rows: Array<{
  artist_id: string;
  source_date: string;
  raw_payload: unknown;
}>, runDate: string): AdapterSignals[] {
  const restored: Record<string, AdapterSignals> = {};
  for (const row of rows) {
    if (row.source_date !== runDate) continue;
    if (!row.raw_payload || typeof row.raw_payload !== "object" || Array.isArray(row.raw_payload)) continue;
    const cached = (row.raw_payload as Record<string, unknown>).dailySourceInputs;
    if (!cached || typeof cached !== "object" || Array.isArray(cached)) continue;
    for (const [source, value] of Object.entries(cached)) {
      if (source === "reddit" && !isRedditAccessEnabled()) continue;
      if (!DAILY_SOURCES.has(source) || !isSignal(value, source)) continue;
      if (source === "bluesky" && value.rawPayload.samplingVersion !== 5) continue;
      if (source === "youtube_comments" && value.rawPayload.samplingVersion !== 6) continue;
      let stats = value.stats;
      let rawPayload = value.rawPayload;
      const calibration = value.rawPayload.marketWideCalibration as { version?: number; metrics?: Record<string, { rawValue?: number }> } | undefined;
      if (calibration?.version === 1 && calibration.metrics) {
        stats = { ...stats };
        for (const [key, metric] of Object.entries(calibration.metrics)) {
          if (key in stats && typeof metric.rawValue === "number" && Number.isFinite(metric.rawValue)) stats[key as keyof typeof stats] = metric.rawValue;
        }
        rawPayload = { ...rawPayload, marketWideCalibration: { ...calibration, version: 2, applied: false, reason: "broad_shift_requires_provider_verification" } };
      }
      if (source === "youtube_comments" && value.rawPayload.pricingInputVersion !== 2) {
        // Migrate the verified cached sample's absolute reception; do not reuse
        // its old mixture of level and momentum after changing the engine.
        const raw = value.rawPayload;
        if (typeof raw.sentimentAverage !== "number" || typeof raw.netShare !== "number") continue;
        stats = Object.keys(value.stats).length ? { socialGrowth: Math.max(-45, Math.min(45, raw.sentimentAverage * 0.34 + raw.netShare * 0.2)) } : {};
        rawPayload = { ...raw, pricingInputVersion: 2 };
      }
      restored[source] ??= {};
      restored[source][row.artist_id] = {
        ...value,
        stats,
        rawPayload: { ...rawPayload, dailySourceAsOf: row.source_date }
      };
    }
  }
  return Object.values(restored);
}

function isSignal(value: unknown, source: string): value is AdapterSignal {
  if (!value || typeof value !== "object") return false;
  const signal = value as AdapterSignal;
  return Boolean(signal.rawPayload && signal.rawPayload.source === source &&
    signal.stats && typeof signal.stats === "object" && !Array.isArray(signal.stats) &&
    Object.values(signal.stats).every(stat => typeof stat === "number" && Number.isFinite(stat)) &&
    (signal.confidence === undefined || (Number.isFinite(signal.confidence) && signal.confidence >= 0 && signal.confidence <= 1)));
}
