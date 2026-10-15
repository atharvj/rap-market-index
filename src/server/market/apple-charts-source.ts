import { clamp } from "@/lib/pricing";
import type { MarketUpdateArtist } from "@/server/market/daily-update";
import type { AdapterSignals, MarketObservation } from "@/server/market/market-data";
import { resolveRecordingArtists } from "@/server/market/recording-credits";
import { getArtistTrackingProfile, getTrackingAliases, normalizeTrackingText } from "@/server/market/artist-tracking";
import { getMarketDate } from "@/server/market/market-date";
import { mergeSameDayAppleSnapshots } from "@/server/market/apple-chart-snapshot";

type ChartKind = "songs" | "albums";
type ChartEntry = { id: string; name: string; artistName: string; artistId?: string; artistUrl?: string; url: string; kind?: string; genres?: Array<{ genreId: string }> };
type PreviousCharts = Record<string, Record<string, unknown>>;
type Chart = { storefront: string; kind: ChartKind; updated: string; entries: ChartEntry[] };
const STOREFRONTS = ["us", "gb", "ca"];

export async function collectAppleChartSignals({ artists, runDate, previous = {}, currentSnapshots = {}, includeAlbums = true, fetchImpl = fetch }: {
  artists: MarketUpdateArtist[]; runDate: string; previous?: PreviousCharts; currentSnapshots?: PreviousCharts; includeAlbums?: boolean; fetchImpl?: typeof fetch;
}) {
  const signals: AdapterSignals = {}, observations: MarketObservation[] = [], warnings: string[] = [];
  const charts: Record<string, Chart> = {};
  const specs = STOREFRONTS.flatMap(storefront => (includeAlbums ? ["songs", "albums"] : ["songs"]).map(kind => ({ storefront, kind: kind as ChartKind })));
  // Keep the expanded six-feed scan bounded; bursting all storefronts/kinds at
  // once caused intermittent provider timeouts in live collection.
  let nextSpec = 0;
  await Promise.all(Array.from({ length: 2 }, async () => {
    while (nextSpec < specs.length) {
      const { storefront, kind } = specs[nextSpec++];
      try {
        const payload = await fetchChart(storefront, kind, fetchImpl);
        const entries = payload.feed?.results, updated = payload.feed?.updated;
        const updatedTime = Date.parse(updated);
        const chartDate = Number.isFinite(updatedTime) ? getMarketDate(new Date(updatedTime)) : "";
        const age = Date.parse(runDate) - Date.parse(chartDate);
        if (!Array.isArray(entries) || entries.length !== 100 || !Number.isFinite(age) || age < 0 || age > 3 * 86400000 ||
          !entries.every((entry: ChartEntry) => validEntry(entry, kind)) || new Set(entries.map((entry: ChartEntry) => entry.id)).size !== 100) throw new Error("Incomplete, stale or invalid chart");
        // Preserve existing song keys so adding albums cannot invent a chart move.
        charts[kind === "songs" ? storefront : `${storefront}:albums`] = { storefront, kind, updated, entries };
      } catch (error) { warnings.push(`Apple Music ${storefront} ${kind} chart unavailable: ${error instanceof Error ? error.message : "request failed"}`); }
    }
  }));
  const credits = Object.fromEntries(Object.entries(charts).map(([key, chart]) => [key, chart.entries.map((entry, index) => ({
    ...entry, rank: index + 1, artists: resolveChartArtists(entry, chart.kind, artists)
  }))]));
  for (const artist of artists) {
    const current: Record<string, number> = {}, deltas: number[] = [];
    const tracks: Array<Record<string, unknown>> = [], albums: Array<Record<string, unknown>> = [];
    const priorScores = previous[artist.id]?.scores as Record<string, number> | undefined;
    const savedToday = currentSnapshots[artist.id] ?? (previous[artist.id]?.runDate === runDate ? previous[artist.id] : undefined);
    for (const [key, entries] of Object.entries(credits)) {
      const chart = charts[key];
      const previousUpdated = (previous[artist.id]?.chartUpdatedAt as Record<string, string> | undefined)?.[key];
      const todayUpdated = (savedToday?.chartUpdatedAt as Record<string, string> | undefined)?.[key];
      if ([previousUpdated, todayUpdated].some(stamp => stamp && Date.parse(chart.updated) < Date.parse(stamp))) {
        warnings.push(`Apple Music ${key} chart predates the saved observation for ${artist.ticker}.`);
        continue;
      }
      const matching = entries.filter(entry => entry.artists.some(a => a.id === artist.id));
      current[key] = matching.reduce((sum, entry) => sum + 101 - entry.rank, 0);
      // Only complete, comparable charts can create rank changes or exits.
      // An artist uncharted on both dates supplies no listening-trend evidence.
      if (typeof priorScores?.[key] === "number" && Number.isFinite(priorScores[key]) && (current[key] > 0 || priorScores[key] > 0)) {
        deltas.push(clamp((current[key] - priorScores[key]) * 0.12, -25, 25));
      }
      (chart.kind === "songs" ? tracks : albums).push(...matching.map(entry => ({ storefront: chart.storefront,
        id: entry.id, title: entry.name, rank: entry.rank, url: entry.url })));
    }
    if (!Object.keys(current).length) continue;
    const rawPayload = { source: "apple_charts", runDate, schemaVersion: 2, status: deltas.length ? "ok" : "baseline_only", scores: current,
      tracks, albums, chartUpdatedAt: Object.fromEntries(Object.keys(current).map(key => [key, charts[key].updated])),
      missingKeys: specs.map(({ storefront, kind }) => kind === "songs" ? storefront : `${storefront}:albums`).filter(key => !(key in current)) };
    signals[artist.id] = { stats: deltas.length ? { streamingGrowth: deltas.reduce((a, b) => a + b, 0) / deltas.length } : {}, confidence: 0.82, rawPayload };
    const snapshot = mergeSameDayAppleSnapshots(rawPayload, savedToday);
    observations.push({ artistId: artist.id, source: "apple_charts", metric: "chart_snapshot", observedDate: runDate,
      value: Object.keys(snapshot.scores as Record<string, unknown>).length, unit: "feeds", rawPayload: snapshot });
    for (const kind of ["songs", "albums"] as const) {
      const keys = Object.keys(current).filter(key => charts[key].kind === kind);
      // A partial regional total would look like a decline on the public chart.
      // Retain the keyed snapshot for comparisons without publishing that total.
      if (keys.length === STOREFRONTS.length) observations.push({ artistId: artist.id, source: "apple_charts", metric: kind === "songs" ? "chart_points" : "album_chart_points",
        observedDate: runDate, value: keys.reduce((sum, key) => sum + current[key], 0), unit: "rank_points", rawPayload });
    }
  }
  return { signals, observations, warnings };
}

function resolveChartArtists(entry: ChartEntry, kind: ChartKind, artists: MarketUpdateArtist[]) {
  if (!entry.artistId) return [];
  // Album features do not establish a performer credit on every track.
  const credited = resolveRecordingArtists({ title: `${entry.artistName} - ${kind === "songs" ? entry.name : ""}`, primaryArtistId: "", artists });
  return credited.filter(artist => {
    const expectedIds = getArtistTrackingProfile(artist)?.externalIds.appleMusicArtistIds;
    const names = getTrackingAliases(artist);
    const isSoloPrimary = names.some(name => normalizeTrackingText(name) === normalizeTrackingText(entry.artistName));
    if (isSoloPrimary && expectedIds?.length && !expectedIds.includes(entry.artistId!)) return false;
    return expectedIds?.includes(entry.artistId!) || artist.name.length > 3 || entry.genres?.some(genre => genre.genreId === "18");
  });
}

function validEntry(entry: ChartEntry, kind: ChartKind) {
  if (!entry || ![entry.id, entry.name, entry.artistName, entry.url].every(value => typeof value === "string" && value.trim().length > 0) ||
    (entry.kind !== undefined && entry.kind !== kind) ||
    (entry.genres !== undefined && (!Array.isArray(entry.genres) || !entry.genres.every(genre => genre && typeof genre.genreId === "string"))) ||
    !/^\d+$/.test(entry.id)) return false;
  try {
    const item = new URL(entry.url);
    if (item.protocol !== "https:" || item.hostname !== "music.apple.com" || !item.pathname.includes("/album/") ||
      !(kind === "albums" ? item.pathname.endsWith(`/${entry.id}`) && !item.searchParams.has("i") : item.searchParams.get("i") === entry.id || item.pathname.endsWith(`/${entry.id}`))) return false;
    // Official compilation entries omit performer IDs. They occupy real chart
    // ranks but cannot establish a roster artist's credit through the title.
    if (kind === "albums" && entry.artistName === "Various Artists" && entry.artistId === undefined && entry.artistUrl === undefined) return true;
    if (typeof entry.artistId !== "string" || !/^\d+$/.test(entry.artistId) || typeof entry.artistUrl !== "string") return false;
    const artist = new URL(entry.artistUrl);
    return artist.protocol === "https:" && artist.hostname === "music.apple.com" &&
      artist.pathname.endsWith(`/${entry.artistId}`) && artist.pathname.includes("/artist/");
  } catch { return false; }
}

async function fetchChart(storefront: string, kind: ChartKind, fetchImpl: typeof fetch) {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetchImpl(`https://rss.marketingtools.apple.com/api/v2/${storefront}/music/most-played/100/${kind}.json`, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) { if (attempt >= 1) throw error; }
  }
}
