import { NextResponse } from "next/server";
import { createServiceRoleClient, getSupabaseConfigStatus } from "@/lib/supabase/server";
import { requireAdminRequest } from "@/server/admin-auth";
import {
  loadActiveArtistCount,
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
      minConfidence: 0.88
    }
  });
}

export async function POST(request: Request) {
  const config = getSupabaseConfigStatus();
  const secret = process.env.MARKET_UPDATE_SECRET;
  const providedSecret = request.headers.get("x-market-update-secret");

  if (!secret || providedSecret !== secret) {
    return NextResponse.json(
      {
        ok: false,
        error: "Missing or invalid market update secret."
      },
      { status: 401 }
    );
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

  try {
    const supabase = createServiceRoleClient();
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
    const result = await resolveArtistSourceIds({
      artists,
      externalIds,
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
    const nextOffset = artistOffset + artists.length;

    return NextResponse.json({
      ok: true,
      dryRun,
      persisted: !dryRun,
      config,
      sources,
      minConfidence,
      batch: {
        offset: artistOffset,
        limit: artistLimit,
        artistCount: artists.length,
        totalArtists,
        nextOffset: nextOffset < totalArtists ? nextOffset : null,
        hasMore: nextOffset < totalArtists
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
