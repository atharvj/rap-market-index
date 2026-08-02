import { clamp } from "@/lib/pricing";
import { scoreArtistNameMatch } from "@/server/market/artist-name-match";
import type { MarketUpdateArtist } from "@/server/market/daily-update";
import type {
  AdapterSignal,
  AdapterSignals,
  ArtistExternalIds,
  MarketObservation,
  ObservationBaselines
} from "@/server/market/market-data";
import {
  buildMomentumQualityPayload,
  buildRateMomentumQualityPayload,
  calculateRateMomentum,
  calculateSnapshotMomentum,
  getBaselineAgeDays,
  getCombinedConfidenceMultiplier
} from "@/server/market/source-quality";
import type { HypeStats } from "@/lib/types";

type LastfmArtistStats = {
  listeners?: number;
  playcount?: number;
};

type LastfmArtistInfo = LastfmArtistStats & {
  requestedName: string;
  returnedName?: string;
  url?: string;
  matchedBy: "musicbrainz_id" | "name_search";
};

type LastfmCollectOptions = {
  artists: MarketUpdateArtist[];
  runDate: string;
  apiKey?: string;
  externalIds?: Record<string, ArtistExternalIds>;
  baselines?: ObservationBaselines;
  delayMs?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

export type LastfmMarketSignals = {
  signals: AdapterSignals;
  observations: MarketObservation[];
  warnings: string[];
};

const SOURCE = "lastfm";
const LISTENERS = "listeners";
const PLAYCOUNT = "playcount";
const REQUEST_ERROR = "request_error";

export async function collectLastfmMarketSignals({
  artists,
  runDate,
  apiKey,
  externalIds = {},
  baselines = {},
  delayMs = 900,
  timeoutMs = 10000,
  fetchImpl = fetch
}: LastfmCollectOptions): Promise<LastfmMarketSignals> {
  const cleanApiKey = apiKey?.trim();

  if (!cleanApiKey) {
    return {
      signals: {},
      observations: [],
      warnings: ["LASTFM_API_KEY is not configured; skipped Last.fm audience signals."]
    };
  }

  const signals: AdapterSignals = {};
  const observations: MarketObservation[] = [];

  for (const [index, artist] of artists.entries()) {
    if (index > 0 && delayMs > 0) {
      await sleep(delayMs);
    }

    const external = externalIds[artist.id];
    const requestedName = external?.lastfmName?.trim() || artist.name;
    const result = await fetchLastfmArtistInfo({
      apiKey: cleanApiKey,
      artistName: requestedName,
      musicbrainzId: external?.musicbrainzId,
      timeoutMs,
      fetchImpl
    });

    if (!result.ok) {
      signals[artist.id] = {
        stats: {},
        rawPayload: {
          source: SOURCE,
          requestedName,
          status: "error",
          error: result.error
        }
      };
      observations.push({
        artistId: artist.id,
        source: SOURCE,
        metric: REQUEST_ERROR,
        observedDate: runDate,
        value: 1,
        unit: "flag",
        rawPayload: {
          requestedName,
          error: result.error
        }
      });
      continue;
    }

    const signal = buildLastfmSignal({
      artist,
      info: result.info,
      runDate,
      baseline: baselines[artist.id] ?? {}
    });

    signals[artist.id] = signal.signal;
    observations.push(...signal.observations);
  }

  return {
    signals,
    observations,
    warnings: []
  };
}

function buildLastfmSignal({
  artist,
  info,
  runDate,
  baseline
}: {
  artist: MarketUpdateArtist;
  info: LastfmArtistInfo;
  runDate: string;
  baseline: Record<string, number>;
}): {
  signal: AdapterSignal;
  observations: MarketObservation[];
} {
  const listenerBaselineAgeDays = getBaselineAgeDays(baseline, LISTENERS);
  const playcountBaselineAgeDays = getBaselineAgeDays(baseline, PLAYCOUNT);
  const nameMatch =
    info.matchedBy === "musicbrainz_id"
      ? {
          ...scoreArtistNameMatch(info.requestedName, info.returnedName ?? info.requestedName),
          confidence: 1,
          status: "trusted_external_id" as const
        }
      : scoreArtistNameMatch(info.requestedName, info.returnedName);
  const trustedIdentity = info.matchedBy === "musicbrainz_id" || nameMatch.confidence >= 0.58;
  const listeners = trustedIdentity ? info.listeners : undefined;
  const playcount = trustedIdentity ? info.playcount : undefined;
  const listenerMomentum = calculateSnapshotMomentum({
    current: listeners,
    baseline: baseline[LISTENERS],
    baselineAgeDays: listenerBaselineAgeDays,
    multiplier: 5.5,
    min: -25,
    max: 70,
    monotonic: true
  });
  const playcountMomentum = calculateSnapshotMomentum({
    current: playcount,
    baseline: baseline[PLAYCOUNT],
    baselineAgeDays: playcountBaselineAgeDays,
    multiplier: 4.5,
    min: -25,
    max: 75,
    monotonic: true
  });
  const playcountRateMomentum = calculateRateMomentum({
    current: playcount,
    baseline: baseline[PLAYCOUNT],
    baselineAgeDays: playcountBaselineAgeDays,
    recentDailyRate: baseline[`${PLAYCOUNT}__recent_daily_rate`],
    recentRateSamples: baseline[`${PLAYCOUNT}__recent_rate_samples`],
    yearAgoDailyRate: baseline[`${PLAYCOUNT}__year_ago_daily_rate`],
    yearAgoRateSamples: baseline[`${PLAYCOUNT}__year_ago_rate_samples`],
    multiplier: 0.18,
    min: -28,
    max: 55,
    monotonic: true
  });
  const stats: Partial<HypeStats> = {};

  if (typeof playcountMomentum.value === "number" || typeof listenerMomentum.value === "number") {
    const streamingGrowth = weightedAverage([
      { value: playcountRateMomentum.value, weight: 0.55 },
      { value: playcountMomentum.value, weight: 0.25 },
      { value: listenerMomentum.value, weight: 0.2 }
    ]);
    if (typeof streamingGrowth === "number") {
      stats.streamingGrowth = clamp(streamingGrowth, -25, 75);
    }
  }

  const rawPayload = {
    source: SOURCE,
    runDate,
    requestedName: info.requestedName,
    returnedName: info.returnedName ?? null,
    matchedBy: info.matchedBy,
    nameMatchConfidence: nameMatch.confidence,
    nameMatchStatus: nameMatch.status,
    url: info.url ?? null,
    listeners: info.listeners ?? null,
    playcount: info.playcount ?? null,
    baselineListeners: baseline[LISTENERS] ?? null,
    baselinePlaycount: baseline[PLAYCOUNT] ?? null,
    listenerBaselineAgeDays,
    playcountBaselineAgeDays,
    listenerMomentum: listenerMomentum.value,
    playcountMomentum: playcountMomentum.value,
    playcountRateMomentum: playcountRateMomentum.value,
    listenerMomentumQuality: buildMomentumQualityPayload(listenerMomentum),
    playcountMomentumQuality: buildMomentumQualityPayload(playcountMomentum),
    playcountRateMomentumQuality: buildRateMomentumQualityPayload(playcountRateMomentum),
    velocityMinimumTickEligible:
      typeof playcountRateMomentum.value === "number" &&
      Math.abs(playcountRateMomentum.value) >= 1 &&
      playcountRateMomentum.recentRateSamples >= 2 &&
      playcountRateMomentum.confidenceMultiplier >= 0.75 &&
      playcountRateMomentum.anomalyFlags.length === 0,
    status: trustedIdentity ? (Object.keys(stats).length ? "ok" : "baseline_only") : "name_mismatch"
  };
  const observations: MarketObservation[] = [];

  if (trustedIdentity && typeof info.listeners === "number") {
    observations.push(createObservation(artist.id, runDate, LISTENERS, info.listeners, "listeners", rawPayload));
  }

  if (trustedIdentity && typeof info.playcount === "number") {
    observations.push(createObservation(artist.id, runDate, PLAYCOUNT, info.playcount, "plays", rawPayload));
  }

  return {
    signal: {
      stats,
      confidence: trustedIdentity
        ? clamp(
            0.86 *
              getCombinedConfidenceMultiplier([listenerMomentum, playcountMomentum, playcountRateMomentum]) *
              nameMatch.confidence,
            0.18,
            0.86
          )
        : 0.05,
      rawPayload
    },
    observations
  };
}

async function fetchLastfmArtistInfo({
  apiKey,
  artistName,
  musicbrainzId,
  timeoutMs,
  fetchImpl
}: {
  apiKey: string;
  artistName: string;
  musicbrainzId?: string;
  timeoutMs: number;
  fetchImpl: typeof fetch;
}): Promise<{ ok: true; info: LastfmArtistInfo } | { ok: false; error: string }> {
  const primary = await requestLastfmArtistInfo({
    apiKey,
    artistName,
    musicbrainzId,
    timeoutMs,
    fetchImpl
  });

  if (primary.ok || !musicbrainzId?.trim()) {
    return primary;
  }

  const fallback = await requestLastfmArtistInfo({
    apiKey,
    artistName,
    timeoutMs,
    fetchImpl
  });

  return fallback.ok
    ? fallback
    : {
        ok: false,
        error: `${primary.error} Safe artist-name fallback also failed: ${fallback.error}`
      };
}

async function requestLastfmArtistInfo({
  apiKey,
  artistName,
  musicbrainzId,
  timeoutMs,
  fetchImpl
}: {
  apiKey: string;
  artistName: string;
  musicbrainzId?: string;
  timeoutMs: number;
  fetchImpl: typeof fetch;
}): Promise<{ ok: true; info: LastfmArtistInfo } | { ok: false; error: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const url = new URL("https://ws.audioscrobbler.com/2.0/");

  url.searchParams.set("method", "artist.getinfo");
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("format", "json");

  if (musicbrainzId?.trim()) {
    url.searchParams.set("mbid", musicbrainzId.trim());
  } else {
    url.searchParams.set("artist", artistName);
    url.searchParams.set("autocorrect", "1");
  }

  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "rap-market-index/0.1 market research"
      }
    });
    const text = await response.text();

    if (!response.ok) {
      return {
        ok: false,
        error: `Last.fm request failed with ${response.status}.`
      };
    }

    const parsed = parseJsonObject(text);

    if (!parsed.ok) {
      return {
        ok: false,
        error: parsed.error
      };
    }

    if (typeof parsed.value.error === "number") {
      const message =
        typeof parsed.value.message === "string" ? parsed.value.message : `Last.fm error ${parsed.value.error}.`;

      return {
        ok: false,
        error: message
      };
    }

    const artist = getObject(parsed.value.artist);
    const stats = getObject(artist?.stats);
    const listeners = getNumber(stats?.listeners);
    const playcount = getNumber(stats?.playcount ?? stats?.plays);

    if (typeof listeners !== "number" && typeof playcount !== "number") {
      return {
        ok: false,
        error: "Last.fm artist info did not include listener or playcount stats."
      };
    }

    return {
      ok: true,
      info: {
        requestedName: artistName,
        returnedName: typeof artist?.name === "string" ? artist.name : undefined,
        url: typeof artist?.url === "string" ? artist.url : undefined,
        matchedBy: musicbrainzId?.trim() ? "musicbrainz_id" : "name_search",
        listeners,
        playcount
      }
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Last.fm request failed."
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
  return {
    artistId,
    source: SOURCE,
    metric,
    observedDate,
    value,
    unit,
    rawPayload
  };
}

function weightedAverage(values: Array<{ value?: number; weight: number }>) {
  const validValues = values.filter((item): item is { value: number; weight: number } => typeof item.value === "number");
  const totalWeight = validValues.reduce((total, item) => total + item.weight, 0);

  if (!validValues.length || totalWeight <= 0) {
    return undefined;
  }

  return validValues.reduce((total, item) => total + item.value * item.weight, 0) / totalWeight;
}

function parseJsonObject(text: string): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  try {
    const value = JSON.parse(text);

    if (!isObject(value)) {
      return {
        ok: false,
        error: "Last.fm returned a non-object response."
      };
    }

    return {
      ok: true,
      value
    };
  } catch {
    return {
      ok: false,
      error: text.slice(0, 220) || "Last.fm returned a non-JSON response."
    };
  }
}

function getObject(value: unknown) {
  return isObject(value) ? value : null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value.replaceAll(",", ""));
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
