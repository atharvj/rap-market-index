import { decodeHtmlEntities } from "@/lib/html-entities";
import { scoreArtistNameMatch } from "@/server/market/artist-name-match";
import { buildWikipediaTitleCandidates } from "@/server/market/artist-text-identifiers";
import type { MarketUpdateArtist } from "@/server/market/daily-update";
import type { AdapterSignals, ArtistExternalIds, MarketObservation, ObservationBaselines } from "@/server/market/market-data";
import { buildMomentumQualityPayload, calculateSnapshotMomentum, getBaselineAgeDays } from "@/server/market/source-quality";

const METRIC = "monthly_listeners";
const ID_PATTERN = /^[A-Za-z0-9]{22}$/;

/** Only an exact, configured artist URL is read. Search snippets and rounded
 * metadata are not observations; a missing/restricted page is never a zero. */
export function parseSpotifyMonthlyListeners(html: string, spotifyId: string, expectedNames: string[]) {
  if (!ID_PATTERN.test(spotifyId)) return null;
  const meta = new Map<string, string>();
  for (const tag of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attributes = new Map<string, string>();
    for (const attr of tag[0].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      attributes.set(attr[1].toLowerCase(), decodeHtmlEntities(attr[2] ?? attr[3]));
    }
    const key = attributes.get("property") ?? attributes.get("name");
    if (key) meta.set(key, attributes.get("content") ?? "");
  }
  const url = meta.get("og:url");
  const name = meta.get("og:title");
  if (url !== `https://open.spotify.com/artist/${spotifyId}` || !name) return null;
  if (!expectedNames.some(expected => scoreArtistNameMatch(expected, name).confidence >= 0.94)) return null;
  const label = html.match(/<[^>]+data-testid=["']monthly-listeners-label["'][^>]*>\s*([\d,]+)\s+monthly listeners\s*</i);
  if (!label || !/^(?:\d{1,3}(?:,\d{3})+|\d+)$/.test(label[1])) return null;
  const monthlyListeners = Number(label[1].replaceAll(",", ""));
  if (!Number.isSafeInteger(monthlyListeners) || monthlyListeners <= 0 || monthlyListeners > 1_000_000_000) return null;
  return { name, url, monthlyListeners };
}

export async function collectSpotifyPublicSignals({
  artists, runDate, externalIds = {}, baselines = {}, delayMs = 250, timeoutMs = 10_000, fetchImpl = fetch
}: {
  artists: MarketUpdateArtist[];
  runDate: string;
  externalIds?: Record<string, ArtistExternalIds>;
  baselines?: ObservationBaselines;
  delayMs?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}) {
  const signals: AdapterSignals = {};
  const observations: MarketObservation[] = [];
  const warnings: string[] = [];
  const eligible = artists.filter(artist => ID_PATTERN.test(externalIds[artist.id]?.spotifyId ?? "")).slice(0, 100);
  const deadline = Date.now() + 120_000;
  let stopped = false;
  let nextIndex = 0;
  async function collectArtist(artist: MarketUpdateArtist) {
    const ids = externalIds[artist.id];
    try {
      const response = await fetchImpl(`https://open.spotify.com/artist/${ids.spotifyId}`, {
        headers: { "Accept-Language": "en-US,en;q=0.9" },
        signal: AbortSignal.timeout(Math.max(1, Math.min(timeoutMs, deadline - Date.now()))),
        redirect: "error"
      });
      if (response.status === 429 || response.status === 403) {
        warnings.push(`Spotify public audience collection stopped after HTTP ${response.status}; existing observations were preserved.`);
        stopped = true;
        return;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const info = parseSpotifyMonthlyListeners(await response.text(), ids.spotifyId!, [...buildWikipediaTitleCandidates(artist.name), ids.lastfmName ?? ""]);
      if (!info) throw new Error("exact artist identity or listener count could not be verified");
      const baseline = baselines[artist.id] ?? {};
      const momentum = calculateSnapshotMomentum({
        current: info.monthlyListeners, baseline: baseline[METRIC],
        baselineAgeDays: getBaselineAgeDays(baseline, METRIC), multiplier: 6,
        min: -25, max: 75, monotonic: false
      });
      const rawPayload = {
        source: "spotify_public", spotifyId: ids.spotifyId, requestedName: artist.name,
        returnedName: info.name, url: info.url, monthlyListeners: info.monthlyListeners,
        observedAt: new Date().toISOString(), matchConfidence: 0.99,
        status: typeof momentum.value === "number" ? "ok" : "baseline_only",
        listenerMomentumQuality: buildMomentumQualityPayload(momentum)
      };
      signals[artist.id] = {
        stats: typeof momentum.value === "number" ? { streamingGrowth: momentum.value } : {},
        confidence: 0.8, rawPayload
      };
      observations.push({
        artistId: artist.id, source: "spotify_public", metric: METRIC, observedDate: runDate,
        observedAt: rawPayload.observedAt, value: info.monthlyListeners, unit: "listeners", rawPayload
      });
    } catch (error) {
      warnings.push(`Spotify audience skipped for ${artist.ticker}: ${error instanceof Error ? error.message : "request failed"}.`);
    }
  }
  // Probe once before opening the bounded worker pool. A provider rejection
  // stops queued work, while two workers prevent slow pages starving the tail.
  if (eligible.length) {
    await collectArtist(eligible[nextIndex++]);
    const worker = async () => {
      while (!stopped && nextIndex < eligible.length) {
        if (Date.now() >= deadline) { stopped = true; warnings.push("Spotify public audience collection reached its time budget; remaining observations were preserved."); return; }
        const artist = eligible[nextIndex++];
        if (delayMs > 0) await new Promise(resolve => setTimeout(resolve, delayMs));
        if (!stopped) await collectArtist(artist);
      }
    };
    await Promise.all([worker(), worker()]);
  }
  if (eligible.length < artists.length) warnings.push(`${artists.length - eligible.length} listings have no verified Spotify artist ID in this batch.`);
  return { signals, observations, warnings };
}

export async function resolveSpotifyPublicIdentity({ musicbrainzId, artistName, fetchImpl = fetch, timeoutMs = 10_000 }: {
  musicbrainzId: string; artistName: string; fetchImpl?: typeof fetch; timeoutMs?: number;
}) {
  if (!/^[a-f0-9-]{36}$/i.test(musicbrainzId)) return null;
  const response = await fetchImpl(`https://musicbrainz.org/ws/2/artist/${musicbrainzId}?inc=url-rels&fmt=json`, {
    headers: { "User-Agent": "RapMarketIndex/1.0 (https://rap-market-index.vercel.app)" }, signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) return null;
  const payload = await response.json() as { id?: string; name?: string; relations?: Array<{ ended?: boolean; url?: { resource?: string } }> };
  const expectedNames = buildWikipediaTitleCandidates(artistName);
  if (payload.id !== musicbrainzId || !expectedNames.some(name => scoreArtistNameMatch(name, payload.name).confidence >= 0.94)) return null;
  const urls = [...new Set((payload.relations ?? []).filter(relation => !relation.ended)
    .map(relation => relation.url?.resource)
    .filter((url): url is string => typeof url === "string" && /^https:\/\/open\.spotify\.com\/artist\/[A-Za-z0-9]{22}\/?$/.test(url)))];
  const candidates = [];
  for (const url of urls.slice(0, 4)) {
    const id = url.match(/artist\/([A-Za-z0-9]{22})/)![1];
    const page = await fetchImpl(`https://open.spotify.com/artist/${id}`, {
      headers: { "Accept-Language": "en-US,en;q=0.9" }, redirect: "error", signal: AbortSignal.timeout(timeoutMs)
    });
    if (page.status === 429 || page.status === 403) break;
    if (!page.ok) continue;
    const info = parseSpotifyMonthlyListeners(await page.text(), id, expectedNames);
    if (info) candidates.push({ ...info, spotifyId: id });
  }
  return candidates.sort((left, right) => right.monthlyListeners - left.monthlyListeners)[0] ?? null;
}
