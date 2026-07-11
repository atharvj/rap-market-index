import { NextResponse } from "next/server";
import {
  createServiceRoleClient,
  getSupabaseConfigStatus
} from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { requireConfirmedUser } from "@/server/user-auth";

export const dynamic = "force-dynamic";
const PRIVATE_HEADERS = { "Cache-Control": "private, no-store, max-age=0" };

type WatchlistBody = {
  artistId?: string;
};

type WatchlistRow = Pick<Database["public"]["Tables"]["watchlist"]["Row"], "artist_id">;

export async function GET(request: Request) {
  const context = await getRequestContext(request);

  if (!context.ok) {
    return context.response;
  }

  const { data, error } = await context.adminSupabase
    .from("watchlist")
    .select("artist_id")
    .eq("user_id", context.userId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        error: formatWatchlistError(error.message)
      },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    watchlist: ((data ?? []) as WatchlistRow[]).map((row) => row.artist_id)
  }, { headers: PRIVATE_HEADERS });
}

export async function POST(request: Request) {
  const context = await getRequestContext(request);

  if (!context.ok) {
    return context.response;
  }

  const body = await parseBody(request);
  const validation = validateBody(body);

  if (!validation.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: validation.error
      },
      { status: 400 }
    );
  }

  const artistId = body.artistId;

  if (!artistId) {
    return NextResponse.json(
      {
        ok: false,
        error: "artistId is required."
      },
      { status: 400 }
    );
  }

  const { error } = await context.adminSupabase.from("watchlist").upsert(
    {
      user_id: context.userId,
      artist_id: artistId
    },
    { onConflict: "user_id,artist_id" }
  );

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        error: formatWatchlistError(error.message)
      },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    artistId
  }, { headers: PRIVATE_HEADERS });
}

export async function DELETE(request: Request) {
  const context = await getRequestContext(request);

  if (!context.ok) {
    return context.response;
  }

  const body = await parseBody(request);
  const validation = validateBody(body);

  if (!validation.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: validation.error
      },
      { status: 400 }
    );
  }

  const artistId = body.artistId;

  if (!artistId) {
    return NextResponse.json(
      {
        ok: false,
        error: "artistId is required."
      },
      { status: 400 }
    );
  }

  const { error } = await context.adminSupabase
    .from("watchlist")
    .delete()
    .eq("user_id", context.userId)
    .eq("artist_id", artistId);

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        error: formatWatchlistError(error.message)
      },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    artistId
  }, { headers: PRIVATE_HEADERS });
}

async function getRequestContext(request: Request) {
  const config = getSupabaseConfigStatus();

  if (!config.readyForPublicReads || !config.serviceRoleConfigured) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          error: "Watchlists are temporarily unavailable."
        },
        { status: 503, headers: PRIVATE_HEADERS }
      )
    };
  }

  const auth = await requireConfirmedUser(request);

  if (!auth.ok) {
    return {
      ok: false as const,
      response: auth.response
    };
  }

  return {
    ok: true as const,
    adminSupabase: createServiceRoleClient(),
    userId: auth.user.id
  };
}

async function parseBody(request: Request): Promise<WatchlistBody> {
  try {
    return (await request.json()) as WatchlistBody;
  } catch {
    return {};
  }
}

function validateBody(body: WatchlistBody): { ok: true } | { ok: false; error: string } {
  if (!body.artistId) {
    return { ok: false, error: "artistId is required." };
  }

  return { ok: true };
}

function formatWatchlistError(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes("schema cache") || normalized.includes("watchlist")) {
    return "Watchlist storage needs setup. Run supabase/migrations/005_watchlist.sql in the Supabase SQL editor.";
  }

  return "Could not update the watchlist.";
}
