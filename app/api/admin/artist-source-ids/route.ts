import { NextResponse } from "next/server";
import { createServiceRoleClient, getSupabaseConfigStatus } from "@/lib/supabase/server";
import { requireAdminRequest } from "@/server/admin-auth";
import {
  loadActiveArtists,
  loadArtistExternalIds,
  upsertArtistExternalIds,
  type ArtistExternalIdUpsert
} from "@/server/market/supabase-repository";

export const dynamic = "force-dynamic";

type SourceIdInput = {
  artistId?: string;
  ticker?: string;
  spotifyId?: string | null;
  spotify_id?: string | null;
  youtubeChannelId?: string | null;
  youtube_channel_id?: string | null;
  musicbrainzId?: string | null;
  musicbrainz_id?: string | null;
  lastfmName?: string | null;
  lastfm_name?: string | null;
  gdeltQuery?: string | null;
  gdelt_query?: string | null;
};

type SourceIdsBody = {
  dryRun?: boolean;
  records?: SourceIdInput[];
};

type YoutubeChannelsResponse = {
  items?: Array<{
    id?: string;
  }>;
  error?: {
    message?: string;
  };
};

const MAX_RECORDS_PER_REQUEST = 500;
const YOUTUBE_RESOLVE_TIMEOUT_MS = 10000;

export async function GET(request: Request) {
  const auth = await requireAdminRequest(request);

  if (!auth.ok) {
    return auth.response;
  }

  const config = getSupabaseConfigStatus();

  if (!config.readyForAdminWrites) {
    return NextResponse.json(
      {
        ok: false,
        error: "Supabase admin credentials are not fully configured.",
        config
      },
      { status: 400 }
    );
  }

  try {
    const supabase = createServiceRoleClient();
    const artists = await loadActiveArtists(supabase);
    const externalIds = await loadArtistExternalIds(
      supabase,
      artists.map((artist) => artist.id)
    );

    return NextResponse.json({
      ok: true,
      config,
      artistCount: artists.length,
      records: artists.map((artist) => ({
        artistId: artist.id,
        ticker: artist.ticker,
        name: artist.name,
        externalIds: externalIds[artist.id] ?? {
          artistId: artist.id
        }
      }))
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: formatSourceIdError(error),
        config
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const config = getSupabaseConfigStatus();
  const body = await parseBody(request);
  const dryRun = body.dryRun !== false;
  const auth = await requireAdminRequest(request);

  if (!auth.ok) {
    return auth.response;
  }

  if (!config.readyForAdminWrites) {
    return NextResponse.json(
      {
        ok: false,
        error: "Supabase admin credentials are not fully configured.",
        config
      },
      { status: 400 }
    );
  }

  try {
    const supabase = createServiceRoleClient();
    const artists = await loadActiveArtists(supabase);
    const normalized = await normalizeSourceIdRecords(body.records, artists, process.env.YOUTUBE_API_KEY);

    if (!normalized.records.length) {
      return NextResponse.json(
        {
          ok: false,
          dryRun,
          error: "No valid artist source ID records were provided.",
          errors: normalized.errors,
          config
        },
        { status: 400 }
      );
    }

    if (normalized.errors.length) {
      return NextResponse.json(
        {
          ok: false,
          dryRun,
          error: "Some artist source ID records were invalid.",
          errors: normalized.errors,
          records: normalized.records,
          config
        },
        { status: 400 }
      );
    }

    const saved = dryRun ? {} : await upsertArtistExternalIds(supabase, normalized.records);

    return NextResponse.json({
      ok: true,
      dryRun,
      persisted: !dryRun,
      config,
      recordCount: normalized.records.length,
      records: normalized.records,
      saved
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        dryRun,
        error: formatSourceIdError(error),
        config
      },
      { status: 500 }
    );
  }
}

async function parseBody(request: Request): Promise<SourceIdsBody> {
  try {
    return (await request.json()) as SourceIdsBody;
  } catch {
    return {};
  }
}

async function normalizeSourceIdRecords(
  records: SourceIdInput[] | undefined,
  artists: Awaited<ReturnType<typeof loadActiveArtists>>,
  youtubeApiKey: string | undefined
) {
  const inputs = Array.isArray(records) ? records.slice(0, MAX_RECORDS_PER_REQUEST) : [];
  const artistsById = new Map(artists.map((artist) => [artist.id, artist]));
  const artistsByTicker = new Map(artists.map((artist) => [artist.ticker, artist]));
  const normalized: ArtistExternalIdUpsert[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  for (const [index, input] of inputs.entries()) {
    if (!input || typeof input !== "object") {
      errors.push(`Record ${index + 1} must be an object.`);
      continue;
    }

    const artist = resolveArtist(input, artistsById, artistsByTicker);

    if (!artist) {
      errors.push(`Record ${index + 1} does not match an active artist.`);
      continue;
    }

    if (seen.has(artist.id)) {
      errors.push(`Record ${index + 1} duplicates artist ${artist.id}.`);
      continue;
    }

    const record: ArtistExternalIdUpsert = {
      artistId: artist.id
    };
    const spotifyId = normalizeSpotifyId(getProvidedValue(input, "spotifyId", "spotify_id"));
    const youtubeChannelId = await normalizeYoutubeChannelId(
      getProvidedValue(input, "youtubeChannelId", "youtube_channel_id"),
      youtubeApiKey
    );
    const musicbrainzId = normalizeMusicbrainzId(getProvidedValue(input, "musicbrainzId", "musicbrainz_id"));
    const lastfmName = normalizeNullableText(getProvidedValue(input, "lastfmName", "lastfm_name"), 120);
    const gdeltQuery = normalizeNullableText(getProvidedValue(input, "gdeltQuery", "gdelt_query"), 320);

    if (spotifyId.error) {
      errors.push(`Record ${index + 1}: ${spotifyId.error}`);
    } else if (spotifyId.provided) {
      record.spotifyId = spotifyId.value;
    }

    if (youtubeChannelId.error) {
      errors.push(`Record ${index + 1}: ${youtubeChannelId.error}`);
    } else if (youtubeChannelId.provided) {
      record.youtubeChannelId = youtubeChannelId.value;
    }

    if (musicbrainzId.error) {
      errors.push(`Record ${index + 1}: ${musicbrainzId.error}`);
    } else if (musicbrainzId.provided) {
      record.musicbrainzId = musicbrainzId.value;
    }

    if (lastfmName.error) {
      errors.push(`Record ${index + 1}: ${lastfmName.error}`);
    } else if (lastfmName.provided) {
      record.lastfmName = lastfmName.value;
    }

    if (gdeltQuery.error) {
      errors.push(`Record ${index + 1}: ${gdeltQuery.error}`);
    } else if (gdeltQuery.provided) {
      record.gdeltQuery = gdeltQuery.value;
    }

    if (Object.keys(record).length === 1) {
      errors.push(`Record ${index + 1} did not include any source IDs.`);
      continue;
    }

    seen.add(artist.id);
    normalized.push(record);
  }

  return {
    records: normalized,
    errors
  };
}

function resolveArtist(
  input: SourceIdInput,
  artistsById: Map<string, Awaited<ReturnType<typeof loadActiveArtists>>[number]>,
  artistsByTicker: Map<string, Awaited<ReturnType<typeof loadActiveArtists>>[number]>
) {
  const artistId = typeof input.artistId === "string" ? input.artistId.trim() : "";
  const ticker = typeof input.ticker === "string" ? input.ticker.trim().toUpperCase() : "";

  return (artistId ? artistsById.get(artistId) : undefined) ?? (ticker ? artistsByTicker.get(ticker) : undefined);
}

function getProvidedValue(input: SourceIdInput, camelKey: keyof SourceIdInput, snakeKey: keyof SourceIdInput) {
  if (Object.prototype.hasOwnProperty.call(input, camelKey)) {
    return input[camelKey];
  }

  if (Object.prototype.hasOwnProperty.call(input, snakeKey)) {
    return input[snakeKey];
  }

  return undefined;
}

function normalizeSpotifyId(value: unknown) {
  const text = normalizeNullableText(value, 120);

  if (!text.provided || text.value === null) {
    return text;
  }

  const id =
    text.value.match(/^spotify:artist:([A-Za-z0-9]+)$/)?.[1] ??
    text.value.match(/open\.spotify\.com\/artist\/([A-Za-z0-9]+)/)?.[1] ??
    text.value;

  if (!/^[A-Za-z0-9]{12,32}$/.test(id)) {
    return {
      provided: true,
      value: null,
      error: "Spotify artist ID must be an artist ID, Spotify artist URL, or spotify:artist URI."
    };
  }

  return {
    provided: true,
    value: id
  };
}

async function normalizeYoutubeChannelId(value: unknown, youtubeApiKey: string | undefined) {
  const text = normalizeNullableText(value, 180);

  if (!text.provided || text.value === null) {
    return text;
  }

  const id = text.value.match(/youtube\.com\/channel\/(UC[\w-]+)/i)?.[1] ?? text.value;

  if (!/^UC[\w-]{20,}$/.test(id)) {
    const handle = extractYoutubeHandle(text.value);

    if (handle) {
      const cleanApiKey = youtubeApiKey?.trim();

      if (!cleanApiKey) {
        return {
          provided: true,
          value: null,
          error: "YouTube handle URLs require YOUTUBE_API_KEY so they can be resolved to a UC... channel ID."
        };
      }

      return resolveYoutubeHandleToChannelId(handle, cleanApiKey);
    }

    return {
      provided: true,
      value: null,
      error: "YouTube channel must be a UC... channel ID, youtube.com/channel URL, @handle, or youtube.com/@handle URL."
    };
  }

  return {
    provided: true,
    value: id
  };
}

function extractYoutubeHandle(value: string) {
  const trimmed = value.trim();
  const directHandle = trimmed.match(/^@([A-Za-z0-9._-]{3,30})$/)?.[1];

  if (directHandle) {
    return directHandle;
  }

  try {
    const url = new URL(trimmed);
    const handle = url.pathname.match(/^\/@([A-Za-z0-9._-]{3,30})(?:\/|$)/)?.[1];

    return handle ?? null;
  } catch {
    return null;
  }
}

async function resolveYoutubeHandleToChannelId(handle: string, apiKey: string) {
  const url = new URL("https://www.googleapis.com/youtube/v3/channels");

  url.searchParams.set("part", "id");
  url.searchParams.set("forHandle", handle);
  url.searchParams.set("key", apiKey);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), YOUTUBE_RESOLVE_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal
    });
    const parsed = (await response.json()) as YoutubeChannelsResponse;
    const channelId = parsed.items?.[0]?.id;

    if (!response.ok) {
      return {
        provided: true,
        value: null,
        error: parsed.error?.message ?? `YouTube handle lookup failed with ${response.status}.`
      };
    }

    if (!channelId) {
      return {
        provided: true,
        value: null,
        error: `YouTube handle @${handle} did not resolve to a channel.`
      };
    }

    return {
      provided: true,
      value: channelId
    };
  } catch (error) {
    return {
      provided: true,
      value: null,
      error: error instanceof Error ? error.message : "YouTube handle lookup failed."
    };
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeMusicbrainzId(value: unknown) {
  const text = normalizeNullableText(value, 64);

  if (!text.provided || text.value === null) {
    return text;
  }

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text.value)) {
    return {
      provided: true,
      value: null,
      error: "MusicBrainz ID must be a UUID."
    };
  }

  return {
    provided: true,
    value: text.value.toLowerCase()
  };
}

function normalizeNullableText(value: unknown, maxLength: number): { provided: boolean; value: string | null; error?: string } {
  if (value === undefined) {
    return {
      provided: false,
      value: null
    };
  }

  if (value === null) {
    return {
      provided: true,
      value: null
    };
  }

  if (typeof value !== "string") {
    return {
      provided: true,
      value: null,
      error: "Source ID values must be strings or null."
    };
  }

  const trimmed = value.trim();

  return {
    provided: true,
    value: trimmed ? trimmed.slice(0, maxLength) : null
  };
}

function formatSourceIdError(error: unknown) {
  const message = error instanceof Error ? error.message : "Artist source ID request failed.";
  const normalized = message.toLowerCase();

  if (normalized.includes("artist_external_ids") || normalized.includes("schema cache")) {
    return "Artist source ID storage needs setup. Run supabase/migrations/006_market_engine.sql in Supabase.";
  }

  return message;
}
