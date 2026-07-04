import type { MarketUpdateArtist } from "@/server/market/daily-update";
import type { ArtistExternalIds } from "@/server/market/market-data";
import type { ArtistExternalIdUpsert } from "@/server/market/supabase-repository";

export type ResolverSource = "spotify" | "youtube" | "musicbrainz";

export type SourceIdResolverCredentials = {
  spotifyClientId?: string;
  spotifyClientSecret?: string;
  youtubeApiKey?: string;
};

export type SourceIdResolverOptions = {
  artists: MarketUpdateArtist[];
  externalIds?: Record<string, ArtistExternalIds>;
  sources?: ResolverSource[];
  credentials?: SourceIdResolverCredentials;
  force?: boolean;
  minConfidence?: number;
  timeoutMs?: number;
  delayMs?: number;
  fetchImpl?: typeof fetch;
};

export type SourceIdCandidate = {
  source: ResolverSource;
  externalId: string;
  label: string;
  url?: string;
  confidence: number;
  reason: string;
  metadata: Record<string, unknown>;
};

export type SourceIdResolverResult = {
  suggestions: Array<{
    artistId: string;
    ticker: string;
    name: string;
    candidates: Partial<Record<ResolverSource, SourceIdCandidate[]>>;
    proposedRecord: ArtistExternalIdUpsert | null;
    skippedExisting: ResolverSource[];
    errors: string[];
  }>;
  records: ArtistExternalIdUpsert[];
  warnings: string[];
};

type SpotifyTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

type SpotifySearchResponse = {
  artists?: {
    items?: Array<{
      id?: string;
      name?: string;
      popularity?: number;
      followers?: {
        total?: number;
      };
      external_urls?: {
        spotify?: string;
      };
    }>;
  };
};

type YoutubeSearchResponse = {
  items?: Array<{
    id?: {
      channelId?: string;
    };
    snippet?: {
      title?: string;
      description?: string;
      channelTitle?: string;
    };
  }>;
  error?: {
    message?: string;
  };
};

type YoutubeChannelsResponse = {
  items?: Array<{
    id?: string;
    snippet?: {
      title?: string;
      description?: string;
      customUrl?: string;
    };
    statistics?: {
      viewCount?: string;
      subscriberCount?: string;
      hiddenSubscriberCount?: boolean;
      videoCount?: string;
    };
  }>;
  error?: {
    message?: string;
  };
};

type MusicBrainzSearchResponse = {
  artists?: Array<{
    id?: string;
    name?: string;
    score?: number | string;
    disambiguation?: string;
    country?: string;
    type?: string;
    tags?: Array<{
      name?: string;
      count?: number;
    }>;
  }>;
};

const DEFAULT_SOURCES: ResolverSource[] = ["spotify", "youtube", "musicbrainz"];

export async function resolveArtistSourceIds({
  artists,
  externalIds = {},
  sources = DEFAULT_SOURCES,
  credentials,
  force = false,
  minConfidence = 0.88,
  timeoutMs = 10000,
  delayMs = 250,
  fetchImpl = fetch
}: SourceIdResolverOptions): Promise<SourceIdResolverResult> {
  const cleanSources = normalizeSources(sources);
  const warnings: string[] = [];
  const records: ArtistExternalIdUpsert[] = [];
  const suggestions: SourceIdResolverResult["suggestions"] = [];
  const spotifyAccessToken = cleanSources.includes("spotify")
    ? await getSpotifyAccessToken({
        clientId: credentials?.spotifyClientId,
        clientSecret: credentials?.spotifyClientSecret,
        timeoutMs,
        fetchImpl
      })
    : null;
  const youtubeApiKey = credentials?.youtubeApiKey?.trim();

  if (cleanSources.includes("spotify") && spotifyAccessToken && !spotifyAccessToken.ok) {
    warnings.push(spotifyAccessToken.error);
  }

  if (cleanSources.includes("youtube") && !youtubeApiKey) {
    warnings.push("YOUTUBE_API_KEY is not configured; YouTube channel candidates cannot be resolved.");
  }

  for (const [index, artist] of artists.entries()) {
    if (index > 0 && delayMs > 0) {
      await sleep(delayMs);
    }

    const existing = externalIds[artist.id];
    const skippedExisting: ResolverSource[] = [];
    const errors: string[] = [];
    const candidates: Partial<Record<ResolverSource, SourceIdCandidate[]>> = {};

    if (cleanSources.includes("spotify")) {
      if (!force && existing?.spotifyId) {
        skippedExisting.push("spotify");
      } else if (spotifyAccessToken?.ok) {
        const result = await resolveSpotifyCandidates({
          artist,
          accessToken: spotifyAccessToken.accessToken,
          timeoutMs,
          fetchImpl
        });

        if (result.ok) {
          candidates.spotify = result.candidates;
        } else {
          errors.push(result.error);
        }
      }
    }

    if (cleanSources.includes("youtube")) {
      if (!force && existing?.youtubeChannelId) {
        skippedExisting.push("youtube");
      } else if (youtubeApiKey) {
        const result = await resolveYoutubeCandidates({
          artist,
          apiKey: youtubeApiKey,
          timeoutMs,
          fetchImpl
        });

        if (result.ok) {
          candidates.youtube = result.candidates;
        } else {
          errors.push(result.error);
        }
      }
    }

    if (cleanSources.includes("musicbrainz")) {
      if (!force && existing?.musicbrainzId) {
        skippedExisting.push("musicbrainz");
      } else {
        const result = await resolveMusicBrainzCandidates({
          artist,
          timeoutMs,
          fetchImpl
        });

        if (result.ok) {
          candidates.musicbrainz = result.candidates;
        } else {
          errors.push(result.error);
        }
      }
    }

    const proposedRecord = buildProposedRecord({
      artistId: artist.id,
      candidates,
      minConfidence
    });

    if (proposedRecord) {
      records.push(proposedRecord);
    }

    suggestions.push({
      artistId: artist.id,
      ticker: artist.ticker,
      name: artist.name,
      candidates,
      proposedRecord,
      skippedExisting,
      errors
    });
  }

  return {
    suggestions,
    records,
    warnings
  };
}

function normalizeSources(sources: ResolverSource[]) {
  const unique = new Set<ResolverSource>();

  for (const source of sources) {
    if (source === "spotify" || source === "youtube" || source === "musicbrainz") {
      unique.add(source);
    }
  }

  return unique.size ? Array.from(unique) : DEFAULT_SOURCES;
}

async function getSpotifyAccessToken({
  clientId,
  clientSecret,
  timeoutMs,
  fetchImpl
}: {
  clientId?: string;
  clientSecret?: string;
  timeoutMs: number;
  fetchImpl: typeof fetch;
}): Promise<{ ok: true; accessToken: string } | { ok: false; error: string }> {
  const cleanClientId = clientId?.trim();
  const cleanClientSecret = clientSecret?.trim();

  if (!cleanClientId || !cleanClientSecret) {
    return {
      ok: false,
      error: "Spotify credentials are not configured; Spotify artist candidates cannot be resolved."
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl("https://accounts.spotify.com/api/token", {
      method: "POST",
      signal: controller.signal,
      headers: {
        authorization: `Basic ${Buffer.from(`${cleanClientId}:${cleanClientSecret}`).toString("base64")}`,
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

async function resolveSpotifyCandidates({
  artist,
  accessToken,
  timeoutMs,
  fetchImpl
}: {
  artist: MarketUpdateArtist;
  accessToken: string;
  timeoutMs: number;
  fetchImpl: typeof fetch;
}): Promise<{ ok: true; candidates: SourceIdCandidate[] } | { ok: false; error: string }> {
  const url = new URL("https://api.spotify.com/v1/search");

  url.searchParams.set("q", `artist:${artist.name}`);
  url.searchParams.set("type", "artist");
  url.searchParams.set("limit", "5");
  url.searchParams.set("market", "US");

  const result = await fetchJson({
    url: url.toString(),
    timeoutMs,
    fetchImpl,
    headers: {
      authorization: `Bearer ${accessToken}`
    }
  });

  if (!result.ok) {
    return result;
  }

  const parsed = result.value as SpotifySearchResponse;
  const candidates = (parsed.artists?.items ?? [])
    .filter((item) => item.id && item.name)
    .map((item) => {
      const confidence = scoreNameMatch(artist.name, item.name ?? "");

      return {
        source: "spotify" as const,
        externalId: item.id ?? "",
        label: item.name ?? "",
        url: item.external_urls?.spotify,
        confidence: clamp(confidence + getPopularityBoost(item.popularity, item.followers?.total), 0, 0.99),
        reason: buildNameReason(artist.name, item.name ?? ""),
        metadata: {
          popularity: item.popularity ?? null,
          followers: item.followers?.total ?? null
        }
      };
    })
    .sort(sortCandidates);

  return {
    ok: true,
    candidates
  };
}

async function resolveYoutubeCandidates({
  artist,
  apiKey,
  timeoutMs,
  fetchImpl
}: {
  artist: MarketUpdateArtist;
  apiKey: string;
  timeoutMs: number;
  fetchImpl: typeof fetch;
}): Promise<{ ok: true; candidates: SourceIdCandidate[] } | { ok: false; error: string }> {
  const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");

  searchUrl.searchParams.set("part", "snippet");
  searchUrl.searchParams.set("type", "channel");
  searchUrl.searchParams.set("q", artist.name);
  searchUrl.searchParams.set("maxResults", "10");
  searchUrl.searchParams.set("key", apiKey);

  const search = await fetchJson({
    url: searchUrl.toString(),
    timeoutMs,
    fetchImpl
  });

  if (!search.ok) {
    return search;
  }

  const parsed = search.value as YoutubeSearchResponse;
  const channelIds = (parsed.items ?? [])
    .map((item) => item.id?.channelId)
    .filter((channelId): channelId is string => Boolean(channelId));

  if (!channelIds.length) {
    return {
      ok: true,
      candidates: []
    };
  }

  const channelsUrl = new URL("https://www.googleapis.com/youtube/v3/channels");

  channelsUrl.searchParams.set("part", "snippet,statistics");
  channelsUrl.searchParams.set("id", channelIds.join(","));
  channelsUrl.searchParams.set("key", apiKey);

  const channels = await fetchJson({
    url: channelsUrl.toString(),
    timeoutMs,
    fetchImpl
  });

  if (!channels.ok) {
    return channels;
  }

  const channelDetails = channels.value as YoutubeChannelsResponse;
  const detailsById = new Map((channelDetails.items ?? []).map((item) => [item.id, item]));
  const candidates = (parsed.items ?? [])
    .map((item): SourceIdCandidate | null => {
      const channelId = item.id?.channelId;
      const details = channelId ? detailsById.get(channelId) : undefined;
      const title = details?.snippet?.title ?? item.snippet?.title ?? "";

      if (!channelId || !title) {
        return null;
      }

      const hiddenSubscriberCount = details?.statistics?.hiddenSubscriberCount ?? false;
      const subscribers = hiddenSubscriberCount ? undefined : getInteger(details?.statistics?.subscriberCount);
      const views = getInteger(details?.statistics?.viewCount);
      const videos = getInteger(details?.statistics?.videoCount);
      const customUrl = details?.snippet?.customUrl ?? null;
      const confidence = scoreYoutubeChannel({
        expected: artist.name,
        title,
        description: details?.snippet?.description ?? item.snippet?.description,
        customUrl,
        subscribers,
        views,
        videos
      });

      return {
        source: "youtube" as const,
        externalId: channelId,
        label: title,
        url: `https://www.youtube.com/channel/${channelId}`,
        confidence,
        reason: buildNameReason(artist.name, title),
        metadata: {
          customUrl,
          subscribers: hiddenSubscriberCount ? null : subscribers ?? null,
          views: views ?? null,
          videos: videos ?? null,
          hiddenSubscriberCount
        }
      };
    })
    .filter((item): item is SourceIdCandidate => Boolean(item))
    .sort(sortCandidates);

  return {
    ok: true,
    candidates
  };
}

async function resolveMusicBrainzCandidates({
  artist,
  timeoutMs,
  fetchImpl
}: {
  artist: MarketUpdateArtist;
  timeoutMs: number;
  fetchImpl: typeof fetch;
}): Promise<{ ok: true; candidates: SourceIdCandidate[] } | { ok: false; error: string }> {
  const url = new URL("https://musicbrainz.org/ws/2/artist/");

  url.searchParams.set("query", `artist:"${artist.name}"`);
  url.searchParams.set("fmt", "json");
  url.searchParams.set("limit", "5");

  const result = await fetchJson({
    url: url.toString(),
    timeoutMs,
    fetchImpl,
    headers: {
      "user-agent": "rap-market-index/0.1 (artist source id resolver)"
    }
  });

  if (!result.ok) {
    return result;
  }

  const parsed = result.value as MusicBrainzSearchResponse;
  const candidates = (parsed.artists ?? [])
    .filter((item) => item.id && item.name)
    .map((item) => {
      const score = getNumber(item.score) ?? 0;
      const tagNames = (item.tags ?? []).map((tag) => tag.name?.toLowerCase()).filter(Boolean);
      const confidence = clamp(scoreNameMatch(artist.name, item.name ?? "") * 0.72 + score / 100 * 0.22 + getMusicTagBoost(tagNames), 0, 0.98);

      return {
        source: "musicbrainz" as const,
        externalId: item.id ?? "",
        label: item.name ?? "",
        url: `https://musicbrainz.org/artist/${item.id}`,
        confidence,
        reason: buildNameReason(artist.name, item.name ?? ""),
        metadata: {
          score,
          disambiguation: item.disambiguation ?? null,
          country: item.country ?? null,
          type: item.type ?? null,
          tags: tagNames
        }
      };
    })
    .sort(sortCandidates);

  return {
    ok: true,
    candidates
  };
}

async function fetchJson({
  url,
  timeoutMs,
  fetchImpl,
  headers
}: {
  url: string;
  timeoutMs: number;
  fetchImpl: typeof fetch;
  headers?: Record<string, string>;
}): Promise<{ ok: true; value: unknown } | { ok: false; error: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers
    });
    const text = await response.text();

    if (!response.ok) {
      return {
        ok: false,
        error: `Resolver request failed with ${response.status}: ${text.slice(0, 180)}`
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
        error: text.slice(0, 220) || "Resolver returned a non-JSON response."
      };
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Resolver request failed."
    };
  } finally {
    clearTimeout(timeout);
  }
}

function buildProposedRecord({
  artistId,
  candidates,
  minConfidence
}: {
  artistId: string;
  candidates: Partial<Record<ResolverSource, SourceIdCandidate[]>>;
  minConfidence: number;
}): ArtistExternalIdUpsert | null {
  const spotify = candidates.spotify?.[0];
  const youtube = candidates.youtube?.[0];
  const musicbrainz = candidates.musicbrainz?.[0];
  const record: ArtistExternalIdUpsert = {
    artistId
  };

  if (spotify && spotify.confidence >= minConfidence) {
    record.spotifyId = spotify.externalId;
  }

  if (youtube && youtube.confidence >= minConfidence) {
    record.youtubeChannelId = youtube.externalId;
  }

  if (musicbrainz && musicbrainz.confidence >= minConfidence) {
    record.musicbrainzId = musicbrainz.externalId;
  }

  return Object.keys(record).length > 1 ? record : null;
}

function scoreNameMatch(expected: string, candidate: string) {
  const expectedName = normalizeName(expected);
  const candidateName = normalizeName(candidate);

  if (!expectedName || !candidateName) {
    return 0;
  }

  const expectedCompact = compactName(expectedName);
  const candidateCompact = compactName(candidateName);

  if (candidateName === expectedName || candidateCompact === expectedCompact) {
    return 0.94;
  }

  if (candidateName === `${expectedName} official` || candidateName === `${expectedName} music`) {
    return 0.9;
  }

  if (
    candidateName.includes(expectedName) ||
    expectedName.includes(candidateName) ||
    candidateCompact.includes(expectedCompact) ||
    expectedCompact.includes(candidateCompact)
  ) {
    return 0.78;
  }

  const expectedTokens = new Set(expectedName.split(" ").filter(Boolean));
  const candidateTokens = new Set(candidateName.split(" ").filter(Boolean));
  const overlap = Array.from(expectedTokens).filter((token) => candidateTokens.has(token)).length;

  return overlap / Math.max(1, expectedTokens.size) * 0.68;
}

function scoreYoutubeChannel({
  expected,
  title,
  description,
  customUrl,
  subscribers,
  views,
  videos
}: {
  expected: string;
  title: string;
  description?: string;
  customUrl?: string | null;
  subscribers?: number;
  views?: number;
  videos?: number;
}) {
  const expectedName = normalizeName(expected);
  const normalizedTitle = normalizeName(title);
  const normalizedDescription = normalizeName(description ?? "");
  const lowercaseTitle = title.toLowerCase();
  const lowercaseDescription = (description ?? "").toLowerCase();
  const normalizedCustomUrl = normalizeName((customUrl ?? "").replace(/^@/, ""));
  let score = scoreNameMatch(expected, title);

  if (lowercaseTitle.includes("official artist channel") || lowercaseTitle.includes("official")) {
    score += 0.08;
  }

  if (normalizedTitle.endsWith(" topic")) {
    score -= 0.08;
  }

  if (lowercaseTitle.includes("vevo")) {
    score += 0.03;
  }

  if (
    lowercaseDescription.includes("official youtube channel") ||
    lowercaseDescription.includes("official artist channel")
  ) {
    score += 0.05;
  }

  if (
    normalizedCustomUrl === expectedName ||
    normalizedCustomUrl === `${expectedName} official` ||
    normalizedCustomUrl === `${expectedName} music`
  ) {
    score += 0.04;
  }

  if (
    normalizedTitle.includes("fan") ||
    normalizedTitle.includes("lyrics") ||
    normalizedTitle.includes("archive") ||
    normalizedDescription.includes("fan channel")
  ) {
    score -= 0.2;
  }

  score += getYoutubeAudienceBoost(subscribers, views);
  score -= getYoutubeAudiencePenalty(subscribers, views, videos);

  return clamp(score, 0, 0.98);
}

function buildNameReason(expected: string, candidate: string) {
  const expectedName = normalizeName(expected);
  const candidateName = normalizeName(candidate);

  if (expectedName === candidateName) {
    return "Exact normalized name match.";
  }

  if (candidateName.includes(expectedName)) {
    return "Candidate name contains the artist name.";
  }

  return "Candidate ranked by normalized name overlap.";
}

function normalizeName(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(the|official|music|channel|vevo)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactName(value: string) {
  return value.replace(/\s+/g, "");
}

function getPopularityBoost(popularity: number | undefined, followers: number | undefined) {
  const popularityBoost = typeof popularity === "number" ? Math.min(0.04, popularity / 1000) : 0;
  const followerBoost = typeof followers === "number" ? Math.min(0.03, Math.log10(Math.max(1, followers)) / 260) : 0;

  return popularityBoost + followerBoost;
}

function getMusicTagBoost(tags: Array<string | undefined>) {
  return tags.some((tag) => tag && ["hip hop", "rap", "trap", "rapper"].includes(tag)) ? 0.04 : 0;
}

function sortCandidates(first: SourceIdCandidate, second: SourceIdCandidate) {
  const confidenceDelta = second.confidence - first.confidence;

  if (Math.abs(confidenceDelta) > 0.001) {
    return confidenceDelta;
  }

  return getCandidateAudienceScale(second) - getCandidateAudienceScale(first);
}

function getYoutubeAudienceBoost(subscribers: number | undefined, views: number | undefined) {
  const subscriberBoost =
    typeof subscribers === "number" ? clamp((Math.log10(subscribers + 1) - 4) * 0.025, 0, 0.1) : 0;
  const viewBoost = typeof views === "number" ? clamp((Math.log10(views + 1) - 6) * 0.018, 0, 0.08) : 0;

  return subscriberBoost + viewBoost;
}

function getYoutubeAudiencePenalty(
  subscribers: number | undefined,
  views: number | undefined,
  videos: number | undefined
) {
  let penalty = 0;

  if (typeof subscribers === "number") {
    if (subscribers < 1000) {
      penalty += 0.16;
    } else if (subscribers < 5000) {
      penalty += 0.1;
    } else if (subscribers < 10000) {
      penalty += 0.07;
    } else if (subscribers < 50000) {
      penalty += 0.03;
    }
  }

  if (typeof views === "number") {
    if (views < 100000) {
      penalty += 0.06;
    } else if (views < 1000000 && typeof subscribers === "number" && subscribers < 10000) {
      penalty += 0.04;
    }
  }

  if (videos === 0) {
    penalty += 0.08;
  }

  return penalty;
}

function getCandidateAudienceScale(candidate: SourceIdCandidate) {
  const subscribers = getNumber(candidate.metadata.subscribers) ?? 0;
  const views = getNumber(candidate.metadata.views) ?? 0;

  return Math.log10(subscribers + 1) * 2 + Math.log10(views + 1);
}

function getInteger(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
