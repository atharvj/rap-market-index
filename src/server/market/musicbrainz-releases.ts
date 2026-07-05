import { clamp } from "@/lib/pricing";
import type { MarketUpdateArtist } from "@/server/market/daily-update";
import type { ArtistExternalIds, MarketEvent } from "@/server/market/market-data";

type MusicbrainzReleaseCollectOptions = {
  artists: MarketUpdateArtist[];
  runDate: string;
  externalIds?: Record<string, ArtistExternalIds>;
  lookbackDays?: number;
  maxReleaseGroups?: number;
  delayMs?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

type MusicbrainzReleaseGroup = {
  id?: string;
  title?: string;
  "first-release-date"?: string;
  "primary-type"?: string | null;
  "secondary-types"?: string[];
  "artist-credit"?: Array<{
    name?: string;
    artist?: {
      id?: string;
      name?: string;
    };
  }>;
};

type MusicbrainzReleaseGroupResponse = {
  "release-groups"?: MusicbrainzReleaseGroup[];
  error?: string;
};

export type MusicbrainzReleaseEvents = {
  eventsByArtist: Record<string, MarketEvent[]>;
  warnings: string[];
};

const SOURCE_NAME = "MusicBrainz";
const SOURCE_PAYLOAD_NAME = "musicbrainz_release_group";
const DEFAULT_LOOKBACK_DAYS = 21;
const DEFAULT_MAX_RELEASE_GROUPS = 100;
const DEFAULT_DELAY_MS = 1100;
const DEFAULT_TIMEOUT_MS = 12000;
const USER_AGENT = "rap-market-index/0.1 (local development; music metadata research)";

export async function collectMusicbrainzReleaseEvents({
  artists,
  runDate,
  externalIds = {},
  lookbackDays = DEFAULT_LOOKBACK_DAYS,
  maxReleaseGroups = DEFAULT_MAX_RELEASE_GROUPS,
  delayMs = DEFAULT_DELAY_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl = fetch
}: MusicbrainzReleaseCollectOptions): Promise<MusicbrainzReleaseEvents> {
  const eventsByArtist: Record<string, MarketEvent[]> = {};
  const warnings: string[] = [];
  let missingMusicbrainzIds = 0;
  let requestErrors = 0;

  for (const [index, artist] of artists.entries()) {
    const musicbrainzId = normalizeMusicbrainzId(externalIds[artist.id]?.musicbrainzId);

    if (!musicbrainzId) {
      missingMusicbrainzIds += 1;
      continue;
    }

    if (index > 0 && delayMs > 0) {
      await sleep(delayMs);
    }

    const result = await fetchReleaseGroups({
      musicbrainzId,
      maxReleaseGroups,
      timeoutMs,
      fetchImpl
    });

    if (!result.ok) {
      requestErrors += 1;

      if (warnings.length < 5) {
        warnings.push(`MusicBrainz release lookup failed for ${artist.ticker}: ${result.error}`);
      }

      continue;
    }

    const events = buildReleaseEvents({
      artist,
      musicbrainzId,
      releaseGroups: result.releaseGroups,
      runDate,
      lookbackDays
    });

    if (events.length) {
      eventsByArtist[artist.id] = events;
    }
  }

  if (missingMusicbrainzIds) {
    warnings.push(`MusicBrainz release detection skipped ${missingMusicbrainzIds} artist(s) without musicbrainz_id.`);
  }

  if (requestErrors > 5) {
    warnings.push(`MusicBrainz release lookup failed for ${requestErrors - 5} additional artist(s).`);
  }

  return {
    eventsByArtist,
    warnings
  };
}

function buildReleaseEvents({
  artist,
  musicbrainzId,
  releaseGroups,
  runDate,
  lookbackDays
}: {
  artist: MarketUpdateArtist;
  musicbrainzId: string;
  releaseGroups: MusicbrainzReleaseGroup[];
  runDate: string;
  lookbackDays: number;
}) {
  const seen = new Set<string>();
  const events: MarketEvent[] = [];

  for (const releaseGroup of releaseGroups) {
    const releaseDate = parseFullDate(releaseGroup["first-release-date"]);
    const title = normalizeTitle(releaseGroup.title);

    if (!releaseDate || !title || !isDateInWindow(releaseDate, runDate, lookbackDays)) {
      continue;
    }

    const type = getReleaseKind(releaseGroup);

    if (!type) {
      continue;
    }

    const key = `${releaseDate}:${title.toLowerCase()}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);

    const score = getReleaseScore(type, artist.category);
    const releaseGroupId = releaseGroup.id;

    events.push({
      artistId: artist.id,
      eventDate: releaseDate,
      eventType: "release",
      title,
      sourceName: SOURCE_NAME,
      sourceUrl: releaseGroupId ? `https://musicbrainz.org/release-group/${releaseGroupId}` : undefined,
      sentimentScore: score.sentimentScore,
      impactScore: score.impactScore,
      confidence: score.confidence,
      rawPayload: {
        source: SOURCE_PAYLOAD_NAME,
        musicbrainzId,
        releaseGroupId: releaseGroupId ?? null,
        releaseKind: type,
        primaryType: releaseGroup["primary-type"] ?? null,
        secondaryTypes: releaseGroup["secondary-types"] ?? [],
        firstReleaseDate: releaseDate,
        artistCredit: getArtistCredit(releaseGroup),
        runDate
      }
    });
  }

  return events;
}

async function fetchReleaseGroups({
  musicbrainzId,
  maxReleaseGroups,
  timeoutMs,
  fetchImpl
}: {
  musicbrainzId: string;
  maxReleaseGroups: number;
  timeoutMs: number;
  fetchImpl: typeof fetch;
}): Promise<{ ok: true; releaseGroups: MusicbrainzReleaseGroup[] } | { ok: false; error: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const url = new URL("https://musicbrainz.org/ws/2/release-group");

  url.searchParams.set("artist", musicbrainzId);
  url.searchParams.set("type", "album|ep|single|mixtape/street");
  url.searchParams.set("release-group-status", "website-default");
  url.searchParams.set("inc", "artist-credits");
  url.searchParams.set("limit", String(Math.max(1, Math.min(maxReleaseGroups, 100))));
  url.searchParams.set("fmt", "json");

  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: {
        accept: "application/json",
        "user-agent": USER_AGENT
      }
    });
    const text = await response.text();

    if (!response.ok) {
      return {
        ok: false,
        error: text ? text.slice(0, 180) : `HTTP ${response.status}`
      };
    }

    const payload = JSON.parse(text) as MusicbrainzReleaseGroupResponse;

    if (payload.error) {
      return {
        ok: false,
        error: payload.error
      };
    }

    return {
      ok: true,
      releaseGroups: Array.isArray(payload["release-groups"]) ? payload["release-groups"] : []
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown MusicBrainz request error."
    };
  } finally {
    clearTimeout(timeout);
  }
}

function getReleaseKind(releaseGroup: MusicbrainzReleaseGroup) {
  const primaryType = normalizeType(releaseGroup["primary-type"]);
  const secondaryTypes = (releaseGroup["secondary-types"] ?? []).map(normalizeType).filter(Boolean);

  if (secondaryTypes.some((type) => IGNORED_SECONDARY_TYPES.has(type))) {
    return null;
  }

  if (secondaryTypes.includes("mixtape/street")) {
    return "mixtape";
  }

  if (primaryType === "album") {
    return "album";
  }

  if (primaryType === "ep") {
    return "ep";
  }

  if (primaryType === "single") {
    return "single";
  }

  return null;
}

function getReleaseScore(kind: "album" | "ep" | "single" | "mixtape", category: MarketUpdateArtist["category"]) {
  const base = {
    album: { sentimentScore: 54, impactScore: 64, confidence: 0.82 },
    mixtape: { sentimentScore: 52, impactScore: 58, confidence: 0.78 },
    ep: { sentimentScore: 49, impactScore: 48, confidence: 0.76 },
    single: { sentimentScore: 42, impactScore: 34, confidence: 0.72 }
  }[kind];
  const categoryMultiplier = {
    superstar: 0.92,
    mainstream: 1,
    rising: 1.06,
    underground: 1.1
  }[category];

  return {
    sentimentScore: base.sentimentScore,
    impactScore: clamp(base.impactScore * categoryMultiplier, -100, 100),
    confidence: base.confidence
  };
}

function getArtistCredit(releaseGroup: MusicbrainzReleaseGroup) {
  return (releaseGroup["artist-credit"] ?? [])
    .map((credit) => credit.name ?? credit.artist?.name)
    .filter((value): value is string => Boolean(value))
    .join("");
}

function normalizeMusicbrainzId(value: string | undefined) {
  const normalized = value?.trim();

  if (!normalized || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(normalized)) {
    return null;
  }

  return normalized;
}

function normalizeTitle(value: string | undefined) {
  const title = value?.trim().replace(/\s+/g, " ");

  return title ? title.slice(0, 160) : null;
}

function parseFullDate(value: string | undefined) {
  const date = value?.trim();

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return null;
  }

  return date;
}

function isDateInWindow(date: string, runDate: string, lookbackDays: number) {
  return date >= shiftDate(runDate, -lookbackDays) && date <= runDate;
}

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);

  return value.toISOString().slice(0, 10);
}

function normalizeType(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const IGNORED_SECONDARY_TYPES = new Set([
  "audio drama",
  "audiobook",
  "broadcast",
  "compilation",
  "dj-mix",
  "field recording",
  "interview",
  "live",
  "soundtrack",
  "spokenword"
]);
