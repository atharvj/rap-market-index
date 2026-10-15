import { collectAppleChartSignals } from "@/server/market/apple-charts-source";
import { getMarketDate, shiftMarketDate } from "@/server/market/market-date";
import { loadActiveArtists, loadLatestObservationPayloads, loadLatestSourceObservationTimes, persistMarketObservations } from "@/server/market/supabase-repository";

const CHART_KEYS = ["us", "gb", "ca", "us:albums", "gb:albums", "ca:albums"];
const RETRY_INTERVAL_MS = 60 * 60 * 1000;

export function isAppleChartRecoveryDue(snapshot: Record<string, unknown> | undefined, lastAttempt: string | undefined, runDate: string, now = Date.now()) {
  const scores = snapshot?.scores as Record<string, unknown> | undefined;
  if (snapshot?.runDate === runDate && (!Array.isArray(snapshot.missingKeys) || snapshot.missingKeys.length === 0) &&
    CHART_KEYS.every(key => typeof scores?.[key] === "number" && Number.isFinite(scores[key]))) return false;
  const last = Date.parse(lastAttempt ?? "");
  return !Number.isFinite(last) || now - last >= RETRY_INTERVAL_MS;
}

// Collect observations independently of quote refreshes. This gives an incomplete
// daily scan a bounded retry after the other collectors have finished.
export async function recoverAppleChartObservations(supabase: Parameters<typeof loadActiveArtists>[0], runDate = getMarketDate()) {
  const artists = await loadActiveArtists(supabase), artistIds = artists.map(artist => artist.id);
  const [snapshots, attempts] = await Promise.all([
    loadLatestObservationPayloads({ supabase, artistIds, source: "apple_charts", metric: ["chart_snapshot", "chart_points", "album_chart_points"], beforeDate: shiftMarketDate(runDate, 1), lookbackDays: 3 }),
    loadLatestSourceObservationTimes({ supabase, artistIds, source: "apple_charts", runDate, lookbackDays: 3 })
  ]);
  const due = artists.filter(artist => isAppleChartRecoveryDue(snapshots[artist.id], attempts[artist.id], runDate));
  if (!due.length) return { skipped: true, attemptedArtists: 0, completedArtists: 0, warnings: [] };
  const charts = await collectAppleChartSignals({ artists: due, runDate, previous: snapshots });
  if (getMarketDate() !== runDate) throw new Error("Chart recovery crossed a market date boundary; retry a fresh collection.");
  await persistMarketObservations(supabase, [...charts.observations, ...due.map(artist => ({
    artistId: artist.id, source: "apple_charts", metric: "collection_attempt", observedDate: runDate,
    value: 1, unit: "flag", rawPayload: { source: "apple_charts", runDate, status: "recovery_attempt" }
  }))]);
  const completedArtists = Object.values(charts.signals).filter(signal => {
    const scores = signal.rawPayload.scores as Record<string, unknown>;
    return CHART_KEYS.every(key => typeof scores?.[key] === "number");
  }).length;
  return { skipped: false, attemptedArtists: due.length, completedArtists, warnings: charts.warnings };
}
