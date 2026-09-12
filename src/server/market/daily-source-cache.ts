import type { AdapterSignal, AdapterSignals } from "@/server/market/market-data";

const DAILY_SOURCES = new Set([
  "gdelt", "listenbrainz", "spotify", "spotify_public", "wikimedia",
  "reddit", "bluesky", "youtube_comments"
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
      if (!DAILY_SOURCES.has(source) || !isSignal(value, source)) continue;
      restored[source] ??= {};
      restored[source][row.artist_id] = {
        ...value,
        rawPayload: { ...value.rawPayload, dailySourceAsOf: row.source_date }
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
