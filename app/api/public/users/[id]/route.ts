import { NextResponse } from "next/server";
import { createServiceRoleClient, getSupabaseConfigStatus } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { getAdminEmails } from "@/server/admin-auth";

export const dynamic = "force-dynamic";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type LeaderboardRow = Database["public"]["Views"]["market_leaderboard"]["Row"];
type ArtistRow = Pick<
  Database["public"]["Tables"]["artists"]["Row"],
  "id" | "name" | "ticker" | "current_price" | "daily_change_percent" | "hype_score" | "accent"
>;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const config = getSupabaseConfigStatus();

  if (!config.serviceRoleConfigured) {
    return NextResponse.json(
      {
        ok: false,
        error: "Public profiles require the server service role key."
      },
      { status: 503 }
    );
  }

  const { id } = await params;

  if (!isUuid(id)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Invalid profile id."
      },
      { status: 400 }
    );
  }

  try {
    const supabase = createServiceRoleClient();
    const [{ data: profile, error: profileError }, { data: leaderboard, error: leaderboardError }] =
      await Promise.all([
        supabase.from("profiles").select("*").eq("id", id).maybeSingle(),
        supabase.from("market_leaderboard").select("*").eq("user_id", id).maybeSingle()
      ]);

    if (profileError) {
      throw new Error(`Could not load public profile: ${profileError.message}`);
    }

    if (leaderboardError) {
      throw new Error(`Could not load public rank: ${leaderboardError.message}`);
    }

    if (!profile) {
      return NextResponse.json(
        {
          ok: false,
          error: "Profile not found."
        },
        { status: 404 }
      );
    }

    const profileRow = profile as ProfileRow;
    const leaderboardRow = leaderboard as LeaderboardRow | null;
    const favoriteArtistIds = Array.isArray(profileRow.favorite_artist_ids)
      ? profileRow.favorite_artist_ids.filter((artistId): artistId is string => typeof artistId === "string")
      : [];
    const favoriteArtists = favoriteArtistIds.length ? await loadFavoriteArtists(supabase, favoriteArtistIds) : [];
    const adminUserIds = await loadAdminUserIds(supabase);

    return NextResponse.json({
      ok: true,
      profile: {
        id: profileRow.id,
        username: profileRow.username,
        bio: profileRow.bio ?? "",
        createdAt: profileRow.created_at,
        favoriteArtists,
        isAdmin: adminUserIds.has(profileRow.id),
        portfolioValue: leaderboardRow ? Number(leaderboardRow.portfolio_value) : Number(profileRow.cash_balance),
        cashBalance: leaderboardRow ? Number(leaderboardRow.cash_balance) : Number(profileRow.cash_balance),
        gainPercent: leaderboardRow ? Number(leaderboardRow.gain_percent) : 0
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Could not load public profile."
      },
      { status: 500 }
    );
  }
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function loadFavoriteArtists(supabase: ReturnType<typeof createServiceRoleClient>, artistIds: string[]) {
  const { data, error } = await supabase
    .from("artists")
    .select("id,name,ticker,current_price,daily_change_percent,hype_score,accent")
    .in("id", artistIds)
    .eq("is_active", true);

  if (error) {
    throw new Error(`Could not load favorite artists: ${error.message}`);
  }

  const rowsById = new Map(((data ?? []) as ArtistRow[]).map((artist) => [artist.id, artist]));

  return artistIds
    .map((artistId) => rowsById.get(artistId))
    .filter((artist): artist is ArtistRow => Boolean(artist))
    .map((artist) => ({
      id: artist.id,
      name: artist.name,
      ticker: artist.ticker,
      currentPrice: Number(artist.current_price),
      dailyChangePercent: Number(artist.daily_change_percent),
      hypeScore: Number(artist.hype_score),
      accent: artist.accent
    }));
}

async function loadAdminUserIds(supabase: ReturnType<typeof createServiceRoleClient>) {
  const adminEmails = new Set(getAdminEmails());
  const adminUserIds = new Set<string>();

  if (!adminEmails.size) {
    return adminUserIds;
  }

  const { data, error } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000
  });

  if (error) {
    return adminUserIds;
  }

  for (const user of data.users) {
    const email = user.email?.trim().toLowerCase();

    if (email && adminEmails.has(email)) {
      adminUserIds.add(user.id);
    }
  }

  return adminUserIds;
}
