import { clamp } from "@/lib/pricing";
import { scoreArtistNameMatch, type ArtistNameMatchResult } from "@/server/market/artist-name-match";
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
  calculatePointDeltaMomentum,
  calculateSnapshotMomentum,
  getBaselineAgeDays,
  getCombinedConfidenceMultiplier
} from "@/server/market/source-quality";
import type { HypeStats } from "@/lib/types";

type SpotifyCredentials = {
  clientId?: string;
  clientSecret?: string;
};

type SpotifyCollectOptions = {
  artists: MarketUpdateArtist[];
  runDate: string;
  credentials?: SpotifyCredentials;
  externalIds?: Record<string, ArtistExternalIds>;
  baselines?: ObservationBaselines;
  delayMs?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

type SpotifyArtistInfo = {
  requestedName: string;
  id: string;
  name: string;
  url?: string;
  followers?: number;
  popularity?: number;
  matchedBy: "spotify_id" | "search";
  matchConfidence: number;
  matchStatus: string;
};

type SpotifyTokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type SpotifyArtistObject = {
  id?: string;
  name?: string;
  popularity?: number;
  followers?: {
    total?: number;
  };
  external_urls?: {
    spotify?: string;
  };
};

type SpotifySearchResponse = {
  artists?: {
    items?: SpotifyArtistObject[];
  };
};

export type SpotifyMarketSignals = {
  signals: AdapterSignals;
  observations: MarketObservation[];
  warnings: string[];
};

const SOURCE = "spotify";
const POPULARITY = "popularity";
const FOLLOWERS = "followers_total";
const REQUEST_ERROR = "request_error";

export async function collectSpotifyMarketSignals({
  artists,
  runDate,
  credentials,
  externalIds = {},
  baselines = {},
  delayMs = 250,
  timeoutMs = 10000,
  fetchImpl = fetch
}: SpotifyCollectOptions): Promise<SpotifyMarketSignals> {
  const clientId = credentials?.clientId?.trim();
  const clientSecret = credentials?.clientSecret?.trim();

  if (!clientId || !clientSecret) {
    return {
      signals: {},
      observations: [],
      warnings: ["Spotify credentials are not configured; skipped Spotify popularity/follower signals."]
    };
  }

  const token = await fetchSpotifyAccessToken({
    clientId,
    clientSecret,
    timeoutMs,
    fetchImpl
  });

  if (!token.ok) {
    return {
      signals: {},
      observations: [],
      warnings: [`Spotify auth failed: ${token.error}`]
    };
  }

  const signals: AdapterSignals = {};
  const observations: MarketObservation[] = [];

  for (const [index, artist] of artists.entries()) {
    if (index > 0 && delayMs > 0) {
      await sleep(delayMs);
    }

    const result = await fetchSpotifyArtistInfo({
      artist,
      externalIds: externalIds[artist.id],
      accessToken: token.accessToken,
      timeoutMs,
      fetchImpl
    });

    if (!result.ok) {
      signals[artist.id] = {
        stats: {},
        rawPayload: {
          source: SOURCE,
          requestedName: artist.name,
          spotifyId: externalIds[artist.id]?.spotifyId ?? null,
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
          requestedName: artist.name,
          spotifyId: externalIds[artist.id]?.spotifyId ?? null,
          error: result.error
        }
      });
      continue;
    }

    const signal = buildSpotifySignal({
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

function buildSpotifySignal({
  artist,
  info,
  runDate,
  baseline
}: {
  artist: MarketUpdateArtist;
  info: SpotifyArtistInfo;
  runDate: string;
  baseline: Record<string, number>;
}): {
  signal: AdapterSignal;
  observations: MarketObservation[];
} {
  const popularityBaselineAgeDays = getBaselineAgeDays(baseline, POPULARITY);
  const followerBaselineAgeDays = getBaselineAgeDays(baseline, FOLLOWERS);
  const popularityMomentum = calculatePointDeltaMomentum({
    current: info.popularity,
    baseline: baseline[POPULARITY],
    baselineAgeDays: popularityBaselineAgeDays,
    multiplier: 8,
    min: -25,
    max: 75,
    extremeJumpPoints: 18
  });
  const followerMomentum = calculateSnapshotMomentum({
    current: info.followers,
    baseline: baseline[FOLLOWERS],
    baselineAgeDays: followerBaselineAgeDays,
    multiplier: 6,
    min: -25,
    max: 75,
    monotonic: true
  });
  const stats: Partial<HypeStats> = {};

  if (typeof popularityMomentum.value === "number" || typeof followerMomentum.value === "number") {
    const streamingGrowth = weightedAverage([
      { value: popularityMomentum.value, weight: 0.75 },
      { value: followerMomentum.value, weight: 0.25 }
    ]);
    const searchGrowth = weightedAverage([
      { value: popularityMomentum.value, weight: 0.45 },
      { value: followerMomentum.value, weight: 0.35 }
    ]);

    if (typeof streamingGrowth === "number") {
      stats.streamingGrowth = clamp(streamingGrowth, -25, 75);
    }

    if (typeof searchGrowth === "number") {
      stats.searchGrowth = clamp(searchGrowth, -30, 95);
    }
  }

  const rawPayload = {
    source: SOURCE,
    runDate,
    requestedName: info.requestedName,
    returnedName: info.name,
    spotifyId: info.id,
    url: info.url ?? null,
    followers: info.followers ?? null,
    popularity: info.popularity ?? null,
    baselineFollowers: baseline[FOLLOWERS] ?? null,
    baselinePopularity: baseline[POPULARITY] ?? null,
    followerBaselineAgeDays,
    popularityBaselineAgeDays,
    followerMomentum: followerMomentum.value,
    popularityMomentum: popularityMomentum.value,
    followerMomentumQuality: buildMomentumQualityPayload(followerMomentum),
    popularityMomentumQuality: buildMomentumQualityPayload(popularityMomentum),
    matchedBy: info.matchedBy,
    matchConfidence: info.matchConfidence,
    matchStatus: info.matchStatus,
    status: Object.keys(stats).length ? "ok" : "baseline_only"
  };
  const observations: MarketObservation[] = [];

  if (typeof info.popularity === "number") {
    observations.push(createObservation(artist.id, runDate, POPULARITY, info.popularity, "score", rawPayload));
  }

  if (typeof info.followers === "number") {
    observations.push(createObservation(artist.id, runDate, FOLLOWERS, info.followers, "followers", rawPayload));
  }

  return {
    signal: {
      stats,
      confidence: clamp(
        0.7 * getCombinedConfidenceMultiplier([popularityMomentum, followerMomentum]) * info.matchConfidence,
        0.16,
        0.7
      ),
      rawPayload
    },
    observations
  };
}

async function fetchSpotifyAccessToken({
  clientId,
  clientSecret,
  timeoutMs,
  fetchImpl
}: {
  clientId: string;
  clientSecret: string;
  timeoutMs: number;
  fetchImpl: typeof fetch;
}): Promise<{ ok: true; accessToken: string } | { ok: false; error: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl("https://accounts.spotify.com/api/token", {
      method: "POST",
      signal: controller.signal,
      headers: {
        authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        grant_type: "client_credentials"
      })
    });
    const parsed = (await response.json()) as SpotifyTokenResponse;

    if (!response.ok || !parsed.access_token) {
      return {
        ok: false,
        error: parsed.error_description ?? parsed.error ?? `Spotify auth failed with ${response.status}.`
      };
    }

    return {
      ok: true,
      accessToken: parsed.access_token
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Spotify auth request failed."
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchSpotifyArtistInfo({
  artist,
  externalIds,
  accessToken,
  timeoutMs,
  fetchImpl
}: {
  artist: MarketUpdateArtist;
  externalIds?: ArtistExternalIds;
  accessToken: string;
  timeoutMs: number;
  fetchImpl: typeof fetch;
}): Promise<{ ok: true; info: SpotifyArtistInfo } | { ok: false; error: string }> {
  if (externalIds?.spotifyId?.trim()) {
    const result = await fetchSpotifyArtistById({
      spotifyId: externalIds.spotifyId.trim(),
      requestedName: artist.name,
      accessToken,
      timeoutMs,
      fetchImpl
    });

    if (result.ok) {
      return result;
    }
  }

  return fetchSpotifyArtistBySearch({
    artist,
    accessToken,
    timeoutMs,
    fetchImpl
  });
}

async function fetchSpotifyArtistById({
  spotifyId,
  requestedName,
  accessToken,
  timeoutMs,
  fetchImpl
}: {
  spotifyId: string;
  requestedName: string;
  accessToken: string;
  timeoutMs: number;
  fetchImpl: typeof fetch;
}): Promise<{ ok: true; info: SpotifyArtistInfo } | { ok: false; error: string }> {
  const result = await fetchSpotifyJson({
    url: `https://api.spotify.com/v1/artists/${encodeURIComponent(spotifyId)}`,
    accessToken,
    timeoutMs,
    fetchImpl
  });

  if (!result.ok) {
    return result;
  }

  const info = parseSpotifyArtist(result.value as SpotifyArtistObject, requestedName, "spotify_id", {
    confidence: 1,
    status: "trusted_external_id"
  });

  if (!info) {
    return {
      ok: false,
      error: "Spotify artist response did not include expected artist fields."
    };
  }

  return {
    ok: true,
    info
  };
}

async function fetchSpotifyArtistBySearch({
  artist,
  accessToken,
  timeoutMs,
  fetchImpl
}: {
  artist: MarketUpdateArtist;
  accessToken: string;
  timeoutMs: number;
  fetchImpl: typeof fetch;
}): Promise<{ ok: true; info: SpotifyArtistInfo } | { ok: false; error: string }> {
  const url = new URL("https://api.spotify.com/v1/search");

  url.searchParams.set("q", `artist:${artist.name}`);
  url.searchParams.set("type", "artist");
  url.searchParams.set("limit", "5");
  url.searchParams.set("market", "US");

  const result = await fetchSpotifyJson({
    url: url.toString(),
    accessToken,
    timeoutMs,
    fetchImpl
  });

  if (!result.ok) {
    return result;
  }

  const parsed = result.value as SpotifySearchResponse;
  const candidates = (parsed.artists?.items ?? [])
    .map((candidate) => {
      const match = scoreArtistNameMatch(artist.name, candidate.name);
      const info = parseSpotifyArtist(candidate, artist.name, "search", match);

      return info ? { info, popularity: getNumber(candidate.popularity) ?? 0 } : null;
    })
    .filter((candidate): candidate is { info: SpotifyArtistInfo; popularity: number } => Boolean(candidate))
    .sort((left, right) => {
      const confidenceDelta = right.info.matchConfidence - left.info.matchConfidence;

      if (Math.abs(confidenceDelta) > 0.015) {
        return confidenceDelta;
      }

      return right.popularity - left.popularity;
    });
  const bestCandidate = candidates[0];
  const minimumConfidence = getSpotifySearchConfidenceThreshold(artist.name);

  if (!bestCandidate) {
    return {
      ok: false,
      error: "No Spotify artist search match was returned."
    };
  }

  if (bestCandidate.info.matchConfidence < minimumConfidence) {
    return {
      ok: false,
      error: `No high-confidence Spotify artist search match was returned. Best match: ${bestCandidate.info.name} (${Math.round(
        bestCandidate.info.matchConfidence * 100
      )}%).`
    };
  }

  return {
    ok: true,
    info: bestCandidate.info
  };
}

async function fetchSpotifyJson({
  url,
  accessToken,
  timeoutMs,
  fetchImpl
}: {
  url: string;
  accessToken: string;
  timeoutMs: number;
  fetchImpl: typeof fetch;
}): Promise<{ ok: true; value: unknown } | { ok: false; error: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    });
    const text = await response.text();

    if (!response.ok) {
      return {
        ok: false,
        error: `Spotify request failed with ${response.status}.`
      };
    }

    try {
      return {
        ok: true,
        value: JSON.parse(text)
      };
    } catch {
      return {
        ok: false,
        error: text.slice(0, 220) || "Spotify returned a non-JSON response."
      };
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Spotify request failed."
    };
  } finally {
    clearTimeout(timeout);
  }
}

function parseSpotifyArtist(
  value: SpotifyArtistObject,
  requestedName: string,
  matchedBy: SpotifyArtistInfo["matchedBy"],
  match?: Pick<ArtistNameMatchResult, "confidence" | "status">
): SpotifyArtistInfo | null {
  if (!value.id || !value.name) {
    return null;
  }

  const nameMatch = match ?? scoreArtistNameMatch(requestedName, value.name);

  return {
    requestedName,
    id: value.id,
    name: value.name,
    url: value.external_urls?.spotify,
    followers: getNumber(value.followers?.total),
    popularity: getNumber(value.popularity),
    matchedBy,
    matchConfidence: nameMatch.confidence,
    matchStatus: nameMatch.status
  };
}

function getSpotifySearchConfidenceThreshold(artistName: string) {
  const normalized = scoreArtistNameMatch(artistName, artistName);

  if (normalized.compactExpected.length <= 3) {
    return 0.9;
  }

  if (normalized.compactExpected.length <= 4) {
    return 0.82;
  }

  return 0.72;
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

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
