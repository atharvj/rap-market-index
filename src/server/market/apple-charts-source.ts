import { clamp } from "@/lib/pricing";
import type { MarketUpdateArtist } from "@/server/market/daily-update";
import type { AdapterSignals, MarketObservation } from "@/server/market/market-data";
import { resolveRecordingArtists } from "@/server/market/recording-credits";
import { getMarketDate } from "@/server/market/market-date";

type ChartEntry = { id: string; name: string; artistName: string; artistId: string; artistUrl: string; url: string; genres?: Array<{ genreId: string }> };
type PreviousCharts = Record<string, Record<string, unknown>>;
const STOREFRONTS = ["us", "gb", "ca"];

export async function collectAppleChartSignals({ artists, runDate, previous = {}, fetchImpl = fetch }: {
  artists: MarketUpdateArtist[]; runDate: string; previous?: PreviousCharts; fetchImpl?: typeof fetch;
}) {
  const signals: AdapterSignals = {};
  const observations: MarketObservation[] = [];
  const warnings: string[] = [];
  const charts: Record<string, { updated: string; entries: ChartEntry[] }> = {};
  for (const storefront of STOREFRONTS) {
    try {
      const payload = await fetchChart(storefront, fetchImpl);
      const entries = payload.feed?.results;
      const updated = payload.feed?.updated;
      const updatedTime = Date.parse(updated);
      const chartDate = Number.isFinite(updatedTime) ? getMarketDate(new Date(updatedTime)) : "";
      const age = Date.parse(runDate) - Date.parse(chartDate);
      if (!Array.isArray(entries) || entries.length !== 100 || !Number.isFinite(age) || age < 0 || age > 3 * 86400000 ||
        !entries.every(validEntry) || new Set(entries.map(e => e.id)).size !== 100) throw new Error("Incomplete, stale or invalid chart");
      charts[storefront] = { updated, entries };
    } catch (error) { warnings.push(`Apple Music ${storefront} chart unavailable: ${error instanceof Error ? error.message : "request failed"}`); }
  }
  const credits = Object.fromEntries(Object.entries(charts).map(([country, chart]) => [country, chart.entries.map((entry, index) => ({
    ...entry, rank: index + 1,
    artists: resolveRecordingArtists({ title: `${entry.artistName} - ${entry.name}`, primaryArtistId: "", artists })
      .filter(artist => artist.name.length > 3 || entry.genres?.some(genre => genre.genreId === "18"))
  }))]));
  for (const artist of artists) {
    const current: Record<string, number> = {};
    const deltas: number[] = [];
    const tracks: Array<{ storefront: string; id: string; title: string; rank: number; url: string }> = [];
    const priorScores = previous[artist.id]?.scores as Record<string, number> | undefined;
    for (const [country, entries] of Object.entries(credits)) {
      const matching = entries.filter(entry => entry.artists.some(a => a.id === artist.id));
      // Rank points measure chart presence, not stream counts. An unchanged
      // chart is neutral; absence counts only when the full chart was fetched.
      current[country] = matching.reduce((sum, entry) => sum + 101 - entry.rank, 0);
      // Uncharted on both dates says nothing about an artist's listening trend.
      if (typeof priorScores?.[country] === "number" && Number.isFinite(priorScores[country]) && (current[country] > 0 || priorScores[country] > 0)) {
        deltas.push(clamp((current[country] - priorScores[country]) * 0.12, -25, 25));
      }
      tracks.push(...matching.map(entry => ({ storefront: country, id: entry.id, title: entry.name, rank: entry.rank, url: entry.url })));
    }
    if (!Object.keys(current).length) continue;
    const rawPayload = { source: "apple_charts", runDate, status: deltas.length ? "ok" : "baseline_only", scores: current,
      tracks, chartUpdatedAt: Object.fromEntries(Object.entries(charts).map(([country, chart]) => [country, chart.updated])) };
    signals[artist.id] = { stats: deltas.length ? { streamingGrowth: deltas.reduce((a, b) => a + b, 0) / deltas.length } : {}, confidence: 0.82, rawPayload };
    observations.push({ artistId: artist.id, source: "apple_charts", metric: "chart_points", observedDate: runDate,
      value: Object.values(current).reduce((a, b) => a + b, 0), unit: "rank_points", rawPayload });
  }
  return { signals, observations, warnings };
}

function validEntry(entry: ChartEntry) {
  if (!entry || !/^\d+$/.test(entry.id) || !/^\d+$/.test(entry.artistId) || !entry.name || !entry.artistName) return false;
  try {
    const track = new URL(entry.url), artist = new URL(entry.artistUrl);
    return track.hostname === "music.apple.com" && artist.hostname === "music.apple.com" &&
      artist.pathname.endsWith(`/${entry.artistId}`) && artist.pathname.includes("/artist/") &&
      (track.searchParams.get("i") === entry.id || track.pathname.endsWith(`/${entry.id}`));
  } catch { return false; }
}

async function fetchChart(storefront: string, fetchImpl: typeof fetch) {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetchImpl(`https://rss.marketingtools.apple.com/api/v2/${storefront}/music/most-played/100/songs.json`, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      if (attempt >= 1) throw error;
    }
  }
}
