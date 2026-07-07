import { NextResponse } from "next/server";
import { formatArtistDisplayName } from "@/lib/artist-display-name";
import { calculateHypeScore, getDailyChangePercent } from "@/lib/pricing";
import { createServiceRoleClient, getSupabaseConfigStatus } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import type { ArtistCategory } from "@/lib/types";
import { requireAdminRequest } from "@/server/admin-auth";

export const dynamic = "force-dynamic";

type ArtistRow = Database["public"]["Tables"]["artists"]["Row"];

type ArtistRosterInput = {
  id?: string;
  name?: string;
  ticker?: string;
  currentPrice?: number;
  previousClose?: number;
  volatility?: number;
  category?: ArtistCategory;
  accent?: string;
  isActive?: boolean;
};

type ArtistRosterBody = {
  artist?: ArtistRosterInput;
  artistId?: string;
  ticker?: string;
  isActive?: boolean;
  confirmDelete?: string;
};

const DEFAULT_ACCENT = "from-fuchsia-300 via-lime-200 to-cyan-300";
const DEFAULT_CATEGORY: ArtistCategory = "underground";
const NEUTRAL_STATS = {
  streamingGrowth: 0,
  youtubeGrowth: 0,
  searchGrowth: 0,
  socialGrowth: 0,
  newsScore: 50,
  traderDemand: 0
};

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
    const { data, error } = await createServiceRoleClient()
      .from("artists")
      .select("*")
      .order("is_active", { ascending: false })
      .order("ticker", { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    const records = ((data ?? []) as ArtistRow[]).map(mapArtistRow);

    return NextResponse.json({
      ok: true,
      config,
      artistCount: records.length,
      activeCount: records.filter((artist) => artist.isActive).length,
      inactiveCount: records.filter((artist) => !artist.isActive).length,
      records
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Artist roster load failed.",
        config
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
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
    const body = await parseBody(request);
    const supabase = createServiceRoleClient();
    const artistInputId = body.artist ? getArtistInputId(body.artist) : "";
    const existingArtist = artistInputId ? await loadExistingArtist(supabase, artistInputId) : null;
    const artist = body.artist ? normalizeArtistInput(body.artist, existingArtist) : null;

    if (artist) {
      const { data, error } = await supabase.from("artists").upsert(artist, { onConflict: "id" }).select("*").single();

      if (error) {
        throw new Error(error.message);
      }

      if (!existingArtist) {
        const statsResult = await supabase
          .from("artist_stats")
          .upsert({ artist_id: artist.id }, { onConflict: "artist_id" });

        if (statsResult.error) {
          throw new Error(statsResult.error.message);
        }
      }

      return NextResponse.json({
        ok: true,
        persisted: true,
        config,
        record: mapArtistRow(data as ArtistRow)
      });
    }

    const artistId = normalizeLookupId(body.artistId);
    const ticker = normalizeOptionalTicker(body.ticker);

    if (!artistId && !ticker) {
      return NextResponse.json(
        {
          ok: false,
          error: "Provide artist data, artistId, or ticker."
        },
        { status: 400 }
      );
    }

    if (typeof body.isActive !== "boolean") {
      return NextResponse.json(
        {
          ok: false,
          error: "Provide isActive as true or false."
        },
        { status: 400 }
      );
    }

    const query = supabase
      .from("artists")
      .update({
        is_active: body.isActive,
        last_move_explanation: body.isActive
          ? "Artist returned to the active market roster."
          : "Artist is inactive while source coverage is reviewed."
      })
      .select("*");
    const result = artistId ? await query.eq("id", artistId).single() : await query.eq("ticker", ticker).single();

    if (result.error) {
      throw new Error(result.error.message);
    }

    return NextResponse.json({
      ok: true,
      persisted: true,
      config,
      record: mapArtistRow(result.data as ArtistRow)
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Artist roster save failed.",
        config
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
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
    const body = await parseBody(request);
    const artistId = normalizeLookupId(body.artistId);
    const ticker = normalizeOptionalTicker(body.ticker);

    if (!artistId && !ticker) {
      return NextResponse.json(
        {
          ok: false,
          error: "Provide artistId or ticker."
        },
        { status: 400 }
      );
    }

    const supabase = createServiceRoleClient();
    const artist = await loadExistingArtistByLookup(supabase, { artistId, ticker });

    if (!artist) {
      return NextResponse.json(
        {
          ok: false,
          error: "Artist not found."
        },
        { status: 404 }
      );
    }

    const confirmation = body.confirmDelete?.trim();

    if (confirmation !== artist.ticker && confirmation !== artist.id) {
      return NextResponse.json(
        {
          ok: false,
          error: `Type ${artist.ticker} or ${artist.id} to confirm permanent deletion.`
        },
        { status: 400 }
      );
    }

    const deleted = await deleteArtistEverywhere(supabase, artist.id);

    return NextResponse.json({
      ok: true,
      persisted: true,
      config,
      deletedArtist: mapArtistRow(artist),
      deleted
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Artist delete failed.",
        config
      },
      { status: 500 }
    );
  }
}

async function parseBody(request: Request): Promise<ArtistRosterBody> {
  try {
    return (await request.json()) as ArtistRosterBody;
  } catch {
    return {};
  }
}

async function loadExistingArtist(
  supabase: ReturnType<typeof createServiceRoleClient>,
  artistId: string
): Promise<ArtistRow | null> {
  const { data, error } = await supabase.from("artists").select("*").eq("id", artistId).maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? null) as ArtistRow | null;
}

async function loadExistingArtistByLookup(
  supabase: ReturnType<typeof createServiceRoleClient>,
  { artistId, ticker }: { artistId: string; ticker: string | null }
): Promise<ArtistRow | null> {
  let query = supabase.from("artists").select("*");
  const result = artistId ? await query.eq("id", artistId).maybeSingle() : await query.eq("ticker", ticker ?? "").maybeSingle();

  if (result.error) {
    throw new Error(result.error.message);
  }

  return (result.data ?? null) as ArtistRow | null;
}

async function deleteArtistEverywhere(supabase: ReturnType<typeof createServiceRoleClient>, artistId: string) {
  const tables: Array<keyof Database["public"]["Tables"]> = [
    "short_transactions",
    "transactions",
    "short_positions",
    "holdings",
    "watchlist",
    "artist_trading_halts",
    "artist_external_ids",
    "artist_stats",
    "price_ticks",
    "price_history",
    "market_events",
    "market_observations",
    "market_signal_snapshots"
  ];
  const deleted: Record<string, number> = {};
  const dynamicClient = supabase as unknown as {
    from: (table: string) => {
      delete: (options?: { count?: "exact" }) => {
        eq: (column: string, value: string) => Promise<{ count: number | null; error: { message: string } | null }>;
      };
    };
  };

  for (const table of tables) {
    const { count, error } = await dynamicClient.from(table).delete({ count: "exact" }).eq("artist_id", artistId);

    if (error) {
      throw new Error(`Could not delete ${table}: ${error.message}`);
    }

    deleted[table] = count ?? 0;
  }

  const artistResult = await supabase.from("artists").delete({ count: "exact" }).eq("id", artistId);

  if (artistResult.error) {
    throw new Error(`Could not delete artist: ${artistResult.error.message}`);
  }

  deleted.artists = artistResult.count ?? 0;

  return deleted;
}

function getArtistInputId(input: ArtistRosterInput) {
  return normalizeLookupId(input.id) || slugify(input.name ?? "");
}

function normalizeArtistInput(
  input: ArtistRosterInput,
  existing: ArtistRow | null
): Database["public"]["Tables"]["artists"]["Insert"] {
  const name = formatArtistDisplayName(input.name);
  const id = getArtistInputId(input);
  const ticker = normalizeOptionalTicker(input.ticker);
  const currentPrice = getPositiveNumber(input.currentPrice, "currentPrice");
  const previousClose = getPositiveNumber(input.previousClose ?? input.currentPrice, "previousClose");
  const volatility = getBoundedNumber(input.volatility ?? 1.4, "volatility", 0.4, 3);
  const category = normalizeCategory(input.category);

  if (!id) {
    throw new Error("Artist id is required.");
  }

  if (!name) {
    throw new Error("Artist name is required.");
  }

  if (!ticker) {
    throw new Error("Ticker is required.");
  }

  return {
    id,
    name,
    ticker,
    current_price: currentPrice,
    previous_close: previousClose,
    daily_change_percent: getDailyChangePercent(currentPrice, previousClose),
    hype_score: existing?.hype_score ?? calculateHypeScore(NEUTRAL_STATS),
    volatility,
    category,
    accent: input.accent?.trim() || existing?.accent || DEFAULT_ACCENT,
    last_move_explanation: existing?.last_move_explanation ?? `${ticker} was added to the market roster.`,
    is_active: input.isActive ?? existing?.is_active ?? true
  };
}

function mapArtistRow(row: ArtistRow) {
  return {
    id: row.id,
    name: row.name,
    ticker: row.ticker,
    currentPrice: Number(row.current_price),
    previousClose: Number(row.previous_close),
    dailyChangePercent: Number(row.daily_change_percent),
    hypeScore: row.hype_score,
    volatility: Number(row.volatility),
    category: row.category,
    accent: row.accent,
    isActive: row.is_active
  };
}

function normalizeLookupId(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();

  return normalized && /^[a-z0-9-]+$/.test(normalized) ? normalized : "";
}

function normalizeOptionalTicker(value: string | undefined) {
  const normalized = value?.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

  return normalized ? normalized.slice(0, 12) : "";
}

function normalizeCategory(value: ArtistCategory | undefined): ArtistCategory {
  return value === "superstar" || value === "mainstream" || value === "rising" || value === "underground"
    ? value
    : DEFAULT_CATEGORY;
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getPositiveNumber(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }

  return Math.round(value * 100) / 100;
}

function getBoundedNumber(value: unknown, label: string, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a number.`);
  }

  return Math.min(max, Math.max(min, Math.round(value * 1000) / 1000));
}
