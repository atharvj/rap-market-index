import { clamp } from "@/lib/pricing";
import type { MarketUpdateArtist } from "@/server/market/daily-update";
import type {
  AdapterSignal,
  AdapterSignals,
  ArtistExternalIds,
  MarketObservation,
  ObservationBaselines
} from "@/server/market/market-data";
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
  const popularityMomentum = calculatePopularityMomentum(info.popularity, baseline[POPULARITY]);
  const followerMomentum = calculateFollowerMomentum(info.followers, baseline[FOLLOWERS]);
  const stats: Partial<HypeStats> = {};

  if (typeof popularityMomentum === "number" || typeof followerMomentum === "number") {
    const streamingGrowth = weightedAverage([
      { value: popularityMomentum, weight: 0.75 },
      { value: followerMomentum, weight: 0.25 }
    ]);
    const searchGrowth = weightedAverage([
      { value: popularityMomentum, weight: 0.45 },
      { value: followerMomentum, weight: 0.35 }
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
    followerMomentum,
    popularityMomentum,
    matchedBy: info.matchedBy,
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
      confidence: 0.7,
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

  const info = parseSpotifyArtist(result.value as SpotifyArtistObject, requestedName, "spotify_id");

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
  url.searchParams.set("limit", "1");
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
  const candidate = parsed.artists?.items?.[0];
  const info = candidate ? parseSpotifyArtist(candidate, artist.name, "search") : null;

  if (!info) {
    return {
      ok: false,
      error: "No Spotify artist search match was returned."
    };
  }

  return {
    ok: true,
    info
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
  matchedBy: SpotifyArtistInfo["matchedBy"]
): SpotifyArtistInfo | null {
  if (!value.id || !value.name) {
    return null;
  }

  return {
    requestedName,
    id: value.id,
    name: value.name,
    url: value.external_urls?.spotify,
    followers: getNumber(value.followers?.total),
    popularity: getNumber(value.popularity),
    matchedBy
  };
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

function calculatePopularityMomentum(current: number | undefined, baseline: number | undefined) {
  if (typeof current !== "number" || typeof baseline !== "number") {
    return undefined;
  }

  return clamp((current - baseline) * 8, -25, 75);
}

function calculateFollowerMomentum(current: number | undefined, baseline: number | undefined) {
  if (typeof current !== "number" || typeof baseline !== "number" || baseline <= 0) {
    return undefined;
  }

  return clamp(((current - baseline) / baseline) * 100 * 6, -25, 75);
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
