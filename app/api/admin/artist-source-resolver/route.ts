import { NextResponse } from "next/server";
import { createServiceRoleClient, getSupabaseConfigStatus } from "@/lib/supabase/server";
import { requireAdminRequest } from "@/server/admin-auth";
import {
  loadActiveArtistCount,
  loadActiveArtists,
  loadActiveArtistsPage,
  loadArtistExternalIds,
  upsertArtistExternalIds
} from "@/server/market/supabase-repository";
import {
  resolveArtistSourceIds,
  type ResolverSource
} from "@/server/market/source-id-resolver";

export const dynamic = "force-dynamic";

type SourceResolverBody = {
  dryRun?: boolean;
  sources?: ResolverSource[];
  artistLimit?: number;
  artistOffset?: number;
  force?: boolean;
  minConfidence?: number;
  prioritizeMissing?: boolean;
};

const DEFAULT_ARTIST_LIMIT = 5;
const MAX_ARTIST_LIMIT = 25;

export async function GET(request: Request) {
  const auth = await requireAdminRequest(request);

  if (!auth.ok) {
    return auth.response;
  }

  return NextResponse.json({
    ok: true,
    config: getSupabaseConfigStatus(),
    endpoint: "/api/admin/artist-source-resolver",
    defaults: {
      artistLimit: DEFAULT_ARTIST_LIMIT,
      maxArtistLimit: MAX_ARTIST_LIMIT,
      sources: ["spotify", "youtube", "musicbrainz"],
      minConfidence: 0.88,
      prioritizeMissing: true
    }
  });
}

export async function POST(request: Request) {
  const config = getSupabaseConfigStatus();
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

  const body = await parseBody(request);
  const dryRun = body.dryRun !== false;
  const artistLimit = getInteger(body.artistLimit, DEFAULT_ARTIST_LIMIT, 1, MAX_ARTIST_LIMIT);
  const artistOffset = getInteger(body.artistOffset, 0, 0, Number.MAX_SAFE_INTEGER);
  const sources = normalizeSources(body.sources);
  const minConfidence = getNumber(body.minConfidence, 0.88, 0.5, 0.99);
  const prioritizeMissing = body.prioritizeMissing !== false;

  if (!dryRun && auth.source !== "market-secret") {
    return NextResponse.json(
      {
        ok: false,
        error: "Persisted source ID resolver runs require the market update secret."
      },
      { status: 401 }
    );
  }

  try {
    const supabase = createServiceRoleClient();
    const batch = await loadResolverArtistBatch({
      supabase,
      sources,
      artistOffset,
      artistLimit,
      prioritizeMissing
    });
    const result = await resolveArtistSourceIds({
      artists: batch.artists,
      externalIds: batch.externalIds,
      sources,
      credentials: {
        spotifyClientId: process.env.SPOTIFY_CLIENT_ID,
        spotifyClientSecret: process.env.SPOTIFY_CLIENT_SECRET,
        youtubeApiKey: process.env.YOUTUBE_API_KEY
      },
      force: Boolean(body.force),
      minConfidence,
      delayMs: sources.includes("musicbrainz") ? 1100 : 250
    });
    const saved = dryRun || !result.records.length ? {} : await upsertArtistExternalIds(supabase, result.records);
    const nextOffset = artistOffset + batch.artists.length;

    return NextResponse.json({
      ok: true,
      dryRun,
      persisted: !dryRun,
      config,
      sources,
      minConfidence,
      prioritizeMissing,
      batch: {
        offset: artistOffset,
        limit: artistLimit,
        artistCount: batch.artists.length,
        totalArtists: batch.totalArtists,
        prioritizedCandidateCount: batch.prioritizedCandidateCount,
        nextOffset: nextOffset < batch.totalArtists ? nextOffset : null,
        hasMore: nextOffset < batch.totalArtists
      },
      warningCount: result.warnings.length,
      warnings: result.warnings,
      proposedRecordCount: result.records.length,
      records: result.records,
      saved,
      suggestions: result.suggestions
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        dryRun,
        error: formatResolverError(error),
        config
      },
      { status: 500 }
    );
  }
}

async function loadResolverArtistBatch({
  supabase,
  sources,
  artistOffset,
  artistLimit,
  prioritizeMissing
}: {
  supabase: ReturnType<typeof createServiceRoleClient>;
  sources: ResolverSource[];
  artistOffset: number;
  artistLimit: number;
  prioritizeMissing: boolean;
}) {
  if (!prioritizeMissing) {
    const [totalArtists, artists] = await Promise.all([
      loadActiveArtistCount(supabase),
      loadActiveArtistsPage({
        supabase,
        offset: artistOffset,
        limit: artistLimit
      })
    ]);
    const externalIds = await loadArtistExternalIds(
      supabase,
      artists.map((artist) => artist.id)
    );

    return {
      artists,
      externalIds,
      totalArtists,
      prioritizedCandidateCount: totalArtists
    };
  }

  const artists = await loadActiveArtists(supabase);
  const externalIds = await loadArtistExternalIds(
    supabase,
    artists.map((artist) => artist.id)
  );
  const prioritizedArtists = [...artists].sort((first, second) => {
    const missingDelta =
      getMissingSourceCount(second.id, externalIds, sources) - getMissingSourceCount(first.id, externalIds, sources);

    if (missingDelta !== 0) {
      return missingDelta;
    }

    return first.ticker.localeCompare(second.ticker);
  });
  const selectedArtists = prioritizedArtists.slice(artistOffset, artistOffset + artistLimit);

  return {
    artists: selectedArtists,
    externalIds: Object.fromEntries(selectedArtists.map((artist) => [artist.id, externalIds[artist.id]])),
    totalArtists: artists.length,
    prioritizedCandidateCount: prioritizedArtists.filter(
      (artist) => getMissingSourceCount(artist.id, externalIds, sources) > 0
    ).length
  };
}

function getMissingSourceCount(
  artistId: string,
  externalIds: Awaited<ReturnType<typeof loadArtistExternalIds>>,
  sources: ResolverSource[]
) {
  const ids = externalIds[artistId];

  return sources.reduce((count, source) => {
    if (source === "spotify") {
      return count + (ids?.spotifyId ? 0 : 1);
    }

    if (source === "youtube") {
      return count + (ids?.youtubeChannelId ? 0 : 1);
    }

    return count + (ids?.musicbrainzId ? 0 : 1);
  }, 0);
}

async function parseBody(request: Request): Promise<SourceResolverBody> {
  try {
    return (await request.json()) as SourceResolverBody;
  } catch {
    return {};
  }
}

function normalizeSources(sources: SourceResolverBody["sources"]): ResolverSource[] {
  if (!Array.isArray(sources) || !sources.length) {
    return ["spotify", "youtube", "musicbrainz"];
  }

  const normalized = sources.filter((source): source is ResolverSource =>
    source === "spotify" || source === "youtube" || source === "musicbrainz"
  );

  return normalized.length ? Array.from(new Set(normalized)) : ["spotify", "youtube", "musicbrainz"];
}

function getInteger(value: unknown, fallback: number, min: number, max: number) {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, value));
}

function getNumber(value: unknown, fallback: number, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, value));
}

function formatResolverError(error: unknown) {
  const message = error instanceof Error ? error.message : "Artist source resolver request failed.";
  const normalized = message.toLowerCase();

  if (normalized.includes("artist_external_ids") || normalized.includes("schema cache")) {
    return "Artist source ID storage needs setup. Run supabase/migrations/006_market_engine.sql in Supabase.";
  }

  return message;
}
