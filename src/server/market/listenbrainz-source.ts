import { clamp } from "@/lib/pricing";
import type { HypeStats } from "@/lib/types";
import type { MarketUpdateArtist } from "@/server/market/daily-update";
import type {
  AdapterSignals,
  ArtistExternalIds,
  MarketObservation,
  ObservationBaselines
} from "@/server/market/market-data";
import {
  buildMomentumQualityPayload,
  calculateSnapshotMomentum,
  getBaselineAgeDays,
  getCombinedConfidenceMultiplier
} from "@/server/market/source-quality";

type ListenBrainzCollectOptions = {
  artists: MarketUpdateArtist[];
  runDate: string;
  externalIds?: Record<string, ArtistExternalIds>;
  baselines?: ObservationBaselines;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

type ListenBrainzPopularityRow = {
  artist_mbid?: unknown;
  total_listen_count?: unknown;
  total_user_count?: unknown;
};

export type ListenBrainzMarketSignals = {
  signals: AdapterSignals;
  observations: MarketObservation[];
  warnings: string[];
};

const SOURCE = "listenbrainz";
const LISTEN_COUNT = "listen_count";
const LISTENER_COUNT = "listener_count";
const REQUEST_ERROR = "request_error";

export async function collectListenBrainzMarketSignals({
  artists,
  runDate,
  externalIds = {},
  baselines = {},
  timeoutMs = 10000,
  fetchImpl = fetch
}: ListenBrainzCollectOptions): Promise<ListenBrainzMarketSignals> {
  const artistsByMbid = new Map<string, MarketUpdateArtist>();

  for (const artist of artists) {
    const mbid = normalizeMbid(externalIds[artist.id]?.musicbrainzId);

    if (mbid) {
      artistsByMbid.set(mbid, artist);
    }
  }

  if (!artistsByMbid.size) {
    return {
      signals: {},
      observations: [],
      warnings: ["ListenBrainz skipped all artists because no MusicBrainz IDs were available."]
    };
  }

  const result = await fetchArtistPopularity({
    artistMbids: Array.from(artistsByMbid.keys()),
    timeoutMs,
    fetchImpl
  });

  if (!result.ok) {
    return {
      signals: {},
      observations: Array.from(artistsByMbid.values()).map((artist) => createObservation(
        artist.id,
        runDate,
        REQUEST_ERROR,
        1,
        "flag",
        { source: SOURCE, error: result.error }
      )),
      warnings: [result.error]
    };
  }

  const signals: AdapterSignals = {};
  const observations: MarketObservation[] = [];

  for (const row of result.rows) {
    const mbid = normalizeMbid(getString(row.artist_mbid));
    const artist = mbid ? artistsByMbid.get(mbid) : undefined;

    if (!artist || !mbid) {
      continue;
    }

    const listenCount = getNumber(row.total_listen_count);
    const listenerCount = getNumber(row.total_user_count);
    const baseline = baselines[artist.id] ?? {};
    const listenMomentum = calculateSnapshotMomentum({
      current: listenCount,
      baseline: baseline[LISTEN_COUNT],
      baselineAgeDays: getBaselineAgeDays(baseline, LISTEN_COUNT),
      multiplier: 4.2,
      min: -20,
      max: 55,
      monotonic: true
    });
    const listenerMomentum = calculateSnapshotMomentum({
      current: listenerCount,
      baseline: baseline[LISTENER_COUNT],
      baselineAgeDays: getBaselineAgeDays(baseline, LISTENER_COUNT),
      multiplier: 5,
      min: -20,
      max: 55,
      monotonic: true
    });
    const stats: Partial<HypeStats> = {};
    const streamingGrowth = weightedAverage([
      { value: listenMomentum.value, weight: 0.65 },
      { value: listenerMomentum.value, weight: 0.35 }
    ]);

    if (typeof streamingGrowth === "number") {
      stats.streamingGrowth = clamp(streamingGrowth, -20, 55);
    }

    const rawPayload = {
      source: SOURCE,
      runDate,
      musicbrainzId: mbid,
      listenCount: listenCount ?? null,
      listenerCount: listenerCount ?? null,
      baselineListenCount: baseline[LISTEN_COUNT] ?? null,
      baselineListenerCount: baseline[LISTENER_COUNT] ?? null,
      listenMomentum: listenMomentum.value,
      listenerMomentum: listenerMomentum.value,
      listenMomentumQuality: buildMomentumQualityPayload(listenMomentum),
      listenerMomentumQuality: buildMomentumQualityPayload(listenerMomentum),
      status: Object.keys(stats).length ? "momentum" : "baseline_only"
    };

    signals[artist.id] = {
      stats,
      confidence: clamp(
        0.62 * getCombinedConfidenceMultiplier([listenMomentum, listenerMomentum]),
        0.15,
        0.62
      ),
      rawPayload
    };

    if (typeof listenCount === "number") {
      observations.push(createObservation(artist.id, runDate, LISTEN_COUNT, listenCount, "listens", rawPayload));
    }

    if (typeof listenerCount === "number") {
      observations.push(createObservation(artist.id, runDate, LISTENER_COUNT, listenerCount, "listeners", rawPayload));
    }
  }

  return {
    signals,
    observations,
    warnings: []
  };
}

async function fetchArtistPopularity({
  artistMbids,
  timeoutMs,
  fetchImpl
}: {
  artistMbids: string[];
  timeoutMs: number;
  fetchImpl: typeof fetch;
}): Promise<{ ok: true; rows: ListenBrainzPopularityRow[] } | { ok: false; error: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl("https://api.listenbrainz.org/1/popularity/artist", {
      method: "POST",
      signal: controller.signal,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": "rap-market-index/0.1 market research"
      },
      body: JSON.stringify({ artist_mbids: artistMbids })
    });
    const text = await response.text();

    if (!response.ok) {
      return {
        ok: false,
        error: `ListenBrainz request failed with ${response.status}: ${text.slice(0, 160)}`
      };
    }

    const value = JSON.parse(text) as unknown;

    if (!Array.isArray(value)) {
      return { ok: false, error: "ListenBrainz returned an unexpected response." };
    }

    return {
      ok: true,
      rows: value.filter((row): row is ListenBrainzPopularityRow => Boolean(row && typeof row === "object"))
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "ListenBrainz request failed."
    };
  } finally {
    clearTimeout(timeout);
  }
}

function createObservation(
  artistId: string,
  observedDate: string,
  metric: string,
  value: number,
  unit: string,
  rawPayload: Record<string, unknown>
): MarketObservation {
  return { artistId, source: SOURCE, metric, observedDate, value, unit, rawPayload };
}

function normalizeMbid(value: string | undefined | null) {
  const normalized = value?.trim().toLowerCase();

  return normalized && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized)
    ? normalized
    : null;
}

function getString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function getNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function weightedAverage(values: Array<{ value?: number; weight: number }>) {
  const valid = values.filter((item): item is { value: number; weight: number } => typeof item.value === "number");
  const totalWeight = valid.reduce((total, item) => total + item.weight, 0);

  return totalWeight > 0
    ? valid.reduce((total, item) => total + item.value * item.weight, 0) / totalWeight
    : undefined;
}
