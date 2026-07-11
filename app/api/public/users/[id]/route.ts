import { NextResponse } from "next/server";
import { createServiceRoleClient, getSupabaseConfigStatus } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { loadArtistImageUrls } from "@/server/market/artist-images";

export const dynamic = "force-dynamic";
const PRIVATE_RESPONSE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0"
};

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type LeaderboardRow = Database["public"]["Views"]["market_leaderboard"]["Row"];
type HoldingRow = Database["public"]["Tables"]["holdings"]["Row"];
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
        supabase
          .from("profiles")
          .select("id,username,bio,avatar_url,created_at,favorite_artist_ids,cash_balance,profile_is_public,portfolio_is_public,is_admin")
          .eq("id", id)
          .maybeSingle(),
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

    if (!profileRow.profile_is_public) {
      return NextResponse.json(
        {
          ok: true,
          profile: {
          id: profileRow.id,
          username: profileRow.username,
          avatarUrl: profileRow.avatar_url ?? "",
          createdAt: profileRow.created_at,
          isAdmin: profileRow.is_admin,
          isPrivate: true,
          portfolioIsPublic: false,
          bio: "",
          favoriteArtists: [],
          holdings: [],
          portfolioValue: null,
          cashBalance: null,
          gainPercent: null
          }
        },
        { headers: PRIVATE_RESPONSE_HEADERS }
      );
    }

    const favoriteArtistIds = Array.isArray(profileRow.favorite_artist_ids)
      ? profileRow.favorite_artist_ids.filter((artistId): artistId is string => typeof artistId === "string")
      : [];
    const favoriteArtists = favoriteArtistIds.length ? await loadFavoriteArtists(supabase, favoriteArtistIds) : [];
    const publicHoldings = profileRow.portfolio_is_public ? await loadPublicHoldings(supabase, profileRow.id) : [];
    const imageArtistIds = Array.from(new Set([
      ...favoriteArtists.map((artist) => artist.id),
      ...publicHoldings.map((holding) => holding.artistId)
    ]));
    const imageNames = Object.fromEntries([
      ...favoriteArtists.map((artist) => [artist.id, artist.name]),
      ...publicHoldings.map((holding) => [holding.artistId, holding.name])
    ]);
    const imageByArtistId = await loadArtistImageUrls(supabase, imageArtistIds, imageNames);

    return NextResponse.json(
      {
        ok: true,
        profile: {
        id: profileRow.id,
        username: profileRow.username,
        bio: profileRow.bio ?? "",
        avatarUrl: profileRow.avatar_url ?? "",
        createdAt: profileRow.created_at,
        favoriteArtists: favoriteArtists.map((artist) => ({
          ...artist,
          imageUrl: imageByArtistId.get(artist.id) ?? null
        })),
        holdings: publicHoldings.map((holding) => ({
          ...holding,
          imageUrl: imageByArtistId.get(holding.artistId) ?? null
        })),
        isAdmin: profileRow.is_admin,
        isPrivate: false,
        portfolioIsPublic: profileRow.portfolio_is_public,
        portfolioValue: profileRow.portfolio_is_public
          ? leaderboardRow ? Number(leaderboardRow.portfolio_value) : Number(profileRow.cash_balance)
          : null,
        cashBalance: profileRow.portfolio_is_public
          ? leaderboardRow ? Number(leaderboardRow.cash_balance) : Number(profileRow.cash_balance)
          : null,
        gainPercent: profileRow.portfolio_is_public ? leaderboardRow ? Number(leaderboardRow.gain_percent) : 0 : null
        }
      },
      { headers: PRIVATE_RESPONSE_HEADERS }
    );
  } catch (error) {
    console.error("Public profile request failed", error);
    return NextResponse.json(
      {
        ok: false,
        error: "Could not load public profile."
      },
      { status: 500, headers: PRIVATE_RESPONSE_HEADERS }
    );
  }
}

async function loadPublicHoldings(supabase: ReturnType<typeof createServiceRoleClient>, userId: string) {
  const { data: holdings, error: holdingsError } = await supabase
    .from("holdings")
    .select("artist_id,shares,average_buy_price")
    .eq("user_id", userId)
    .gt("shares", 0);

  if (holdingsError) {
    throw new Error(`Could not load public holdings: ${holdingsError.message}`);
  }

  const holdingRows = (holdings ?? []) as HoldingRow[];
  const artistIds = holdingRows.map((holding) => holding.artist_id);

  if (!artistIds.length) {
    return [];
  }

  const { data: artists, error: artistsError } = await supabase
    .from("artists")
    .select("id,name,ticker,current_price,daily_change_percent,hype_score,accent")
    .in("id", artistIds)
    .eq("is_active", true);

  if (artistsError) {
    throw new Error(`Could not load holding artists: ${artistsError.message}`);
  }

  const artistsById = new Map(((artists ?? []) as ArtistRow[]).map((artist) => [artist.id, artist]));

  return holdingRows
    .map((holding) => {
      const artist = artistsById.get(holding.artist_id);

      if (!artist) {
        return null;
      }

      const shares = Number(holding.shares);
      const currentPrice = Number(artist.current_price);
      const averageBuyPrice = Number(holding.average_buy_price);
      const marketValue = shares * currentPrice;
      const profitLoss = shares * (currentPrice - averageBuyPrice);
      const profitLossPercent = averageBuyPrice > 0 ? ((currentPrice - averageBuyPrice) / averageBuyPrice) * 100 : 0;

      return {
        artistId: artist.id,
        name: artist.name,
        ticker: artist.ticker,
        accent: artist.accent,
        shares,
        currentPrice,
        dailyChangePercent: Number(artist.daily_change_percent),
        marketValue,
        profitLoss,
        profitLossPercent
      };
    })
    .filter((holding): holding is NonNullable<typeof holding> => Boolean(holding))
    .sort((a, b) => b.marketValue - a.marketValue)
    .slice(0, 12);
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
