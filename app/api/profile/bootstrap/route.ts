import { NextResponse } from "next/server";
import { MAX_FAVORITE_ARTISTS, MAX_FAVORITE_GENRES, MIN_FAVORITE_ARTISTS } from "@/lib/onboarding";
import { createAnonServerClient, createServiceRoleClient, getSupabaseConfigStatus } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import type { Holding, ShortPosition, Transaction } from "@/lib/types";
import { isAdminEmail } from "@/server/admin-auth";
import { enforceRateLimit } from "@/server/rate-limit";
import { requireConfirmedUser } from "@/server/user-auth";

export const dynamic = "force-dynamic";

type BootstrapBody = {
  username?: string;
  profileBio?: string;
  favoriteArtistIds?: string[];
  favoriteGenres?: string[];
  profileIsPublic?: boolean;
  portfolioIsPublic?: boolean;
  onboardingCompleted?: boolean;
};

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type HoldingRow = Database["public"]["Tables"]["holdings"]["Row"];
type ShortPositionRow = Database["public"]["Tables"]["short_positions"]["Row"];
type TransactionRow = Database["public"]["Views"]["market_trade_events"]["Row"];

export async function POST(request: Request) {
  const config = getSupabaseConfigStatus();

  if (!config.readyForPublicReads || !config.serviceRoleConfigured) {
    return NextResponse.json(
      {
        ok: false,
        error: "Secure account storage is temporarily unavailable."
      },
      { status: 503 }
    );
  }

  try {
    const body = await parseBody(request);
    const auth = await requireConfirmedUser(request);

    if (!auth.ok) {
      return auth.response;
    }

    const limited = await enforceRateLimit({
      request,
      identifier: auth.user.id,
      scope: "profile-bootstrap",
      limit: 120,
      windowSeconds: 300
    });

    if (limited) {
      return limited;
    }

    const { supabase, user } = auth;

    const profileSupabase = createServiceRoleClient();
    const bodyHasUsername = typeof body.username === "string" && Boolean(body.username.trim());

    const [profile, holdings, shortPositions, transactions] = await Promise.all([
      getOrCreateProfile({
        supabase: profileSupabase,
        userId: user.id,
        email: user.email,
        username: body.username ?? user.user_metadata?.username,
        profileBio: body.profileBio,
        favoriteArtistIds: body.favoriteArtistIds,
        favoriteGenres: body.favoriteGenres,
        profileIsPublic: body.profileIsPublic,
        portfolioIsPublic: body.portfolioIsPublic,
        onboardingCompleted: body.onboardingCompleted,
        isAdmin: isAdminEmail(user.email),
        usernameWasSelected: bodyHasUsername || user.user_metadata?.username_is_user_selected === true
      }),
      loadHoldings(supabase, user.id),
      loadShortPositions(supabase, user.id),
      loadTransactions(profileSupabase, user.id)
    ]);

    return NextResponse.json(
      {
        ok: true,
        profile: {
          id: profile.id,
          username: profile.username,
          cashBalance: Number(profile.cash_balance),
          bio: getProfileBio(profile),
          favoriteArtistIds: getFavoriteArtistIds(profile),
          favoriteGenres: getFavoriteGenres(profile),
          avatarUrl: getAvatarUrl(profile),
          profileIsPublic: profile.profile_is_public,
          portfolioIsPublic: profile.portfolio_is_public,
          onboardingCompleted: profile.onboarding_completed,
          isAdmin: isAdminEmail(user.email)
        },
        holdings,
        shortPositions,
        transactions
      },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const migrationPending = /profile_is_public|portfolio_is_public|favorite_genres|onboarding_completed|market_impact_exempt|is_admin/i.test(message);
    const safeValidationMessage = /^(That username is already taken\.|Username must be |Choose at least )/.test(message)
      ? message
      : null;

    if (!safeValidationMessage) {
      console.error("Profile bootstrap failed", error);
    }

    return NextResponse.json(
      {
        ok: false,
        error: safeValidationMessage ?? (migrationPending
          ? "Account privacy setup is incomplete. Run Supabase migration 022_account_privacy_and_onboarding.sql."
          : "Could not load this account.")
      },
      { status: safeValidationMessage ? 409 : 500, headers: { "Cache-Control": "private, no-store, max-age=0" } }
    );
  }
}

async function getOrCreateProfile({
  supabase,
  userId,
  email,
  username,
  profileBio,
  favoriteArtistIds,
  favoriteGenres,
  profileIsPublic,
  portfolioIsPublic,
  onboardingCompleted,
  isAdmin,
  usernameWasSelected
}: {
  supabase: ReturnType<typeof createServiceRoleClient>;
  userId: string;
  email?: string;
  username?: string;
  profileBio?: string;
  favoriteArtistIds?: string[];
  favoriteGenres?: string[];
  profileIsPublic?: boolean;
  portfolioIsPublic?: boolean;
  onboardingCompleted?: boolean;
  isAdmin: boolean;
  usernameWasSelected: boolean;
}) {
  const existing = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();

  if (existing.error) {
    throw new Error(`Could not load profile: ${existing.error.message}`);
  }

  if (existing.data) {
    const profile = existing.data as ProfileRow;
    const preferredUsername =
      typeof username === "string" && username.trim() ? normalizeUsername(username, undefined) : null;
    const update: Partial<ProfileRow> = {};

    if (onboardingCompleted === true) {
      await assertOnboardingSelection({
        supabase,
        favoriteGenres: Array.isArray(favoriteGenres) ? normalizeFavoriteGenres(favoriteGenres) : getFavoriteGenres(profile),
        favoriteArtistIds: Array.isArray(favoriteArtistIds)
          ? normalizeFavoriteArtistIds(favoriteArtistIds)
          : getFavoriteArtistIds(profile)
      });
    }

    if (preferredUsername && preferredUsername !== profile.username) {
      update.username = preferredUsername;
    }

    if (typeof profileBio === "string") {
      update.bio = normalizeBio(profileBio);
    }

    if (Array.isArray(favoriteArtistIds)) {
      update.favorite_artist_ids = normalizeFavoriteArtistIds(favoriteArtistIds);
    }

    if (Array.isArray(favoriteGenres)) {
      update.favorite_genres = normalizeFavoriteGenres(favoriteGenres);
    }

    if (typeof profileIsPublic === "boolean") {
      update.profile_is_public = profileIsPublic;
    }

    if (typeof portfolioIsPublic === "boolean") {
      update.portfolio_is_public = portfolioIsPublic;
    }

    if (typeof onboardingCompleted === "boolean") {
      update.onboarding_completed = onboardingCompleted;
    }

    if (profile.market_impact_exempt !== isAdmin) {
      update.market_impact_exempt = isAdmin;
    }

    if (profile.is_admin !== isAdmin) {
      update.is_admin = isAdmin;
    }

    if (Object.keys(update).length) {
      const updated = await supabase.from("profiles").update(update).eq("id", userId).select("*").single();

      if (updated.error) {
        throw new Error(formatProfileWriteError(updated.error.message));
      }

      return updated.data as ProfileRow;
    }

    return profile;
  }

  const safeUsername = normalizeUsername(username, email);

  if (onboardingCompleted === true) {
    await assertOnboardingSelection({
      supabase,
      favoriteGenres: Array.isArray(favoriteGenres) ? normalizeFavoriteGenres(favoriteGenres) : [],
      favoriteArtistIds: Array.isArray(favoriteArtistIds) ? normalizeFavoriteArtistIds(favoriteArtistIds) : []
    });
  }

  const insertProfile = (profileUsername: string) =>
    supabase
      .from("profiles")
      .insert({
        id: userId,
        username: profileUsername,
        bio: typeof profileBio === "string" ? normalizeBio(profileBio) : undefined,
        favorite_artist_ids: Array.isArray(favoriteArtistIds) ? normalizeFavoriteArtistIds(favoriteArtistIds) : undefined,
        favorite_genres: Array.isArray(favoriteGenres) ? normalizeFavoriteGenres(favoriteGenres) : undefined,
        profile_is_public: typeof profileIsPublic === "boolean" ? profileIsPublic : true,
        portfolio_is_public: typeof portfolioIsPublic === "boolean" ? portfolioIsPublic : true,
        onboarding_completed: typeof onboardingCompleted === "boolean" ? onboardingCompleted : false,
        market_impact_exempt: isAdmin,
        is_admin: isAdmin
      })
      .select("*")
      .single();

  const inserted = await insertProfile(safeUsername);

  if (inserted.error) {
    if (isDuplicateKeyError(inserted.error.message)) {
      const racedProfile = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();

      if (racedProfile.error) {
        throw new Error(`Could not verify profile creation: ${racedProfile.error.message}`);
      }

      if (racedProfile.data) {
        return racedProfile.data as ProfileRow;
      }

      if (!usernameWasSelected) {
        const fallbackUsername = buildFallbackUsername(safeUsername, userId);
        const retried = await insertProfile(fallbackUsername);

        if (!retried.error) {
          return retried.data as ProfileRow;
        }

        throw new Error(`Could not create profile: ${formatProfileWriteError(retried.error.message)}`);
      }
    }

    throw new Error(`Could not create profile: ${formatProfileWriteError(inserted.error.message)}`);
  }

  return inserted.data as ProfileRow;
}

async function loadHoldings(
  supabase: ReturnType<typeof createAnonServerClient>,
  userId: string
): Promise<Holding[]> {
  const { data, error } = await supabase
    .from("holdings")
    .select("*")
    .eq("user_id", userId);

  if (error) {
    throw new Error(`Could not load holdings: ${error.message}`);
  }

  return ((data ?? []) as HoldingRow[]).map((holding) => ({
    artistId: holding.artist_id,
    shares: Number(holding.shares),
    averageBuyPrice: Number(holding.average_buy_price)
  }));
}

async function loadShortPositions(
  supabase: ReturnType<typeof createAnonServerClient>,
  userId: string
): Promise<ShortPosition[]> {
  const { data, error } = await supabase
    .from("short_positions")
    .select("*")
    .eq("user_id", userId);

  if (error) {
    throw new Error(`Could not load short positions: ${error.message}`);
  }

  return ((data ?? []) as ShortPositionRow[]).map((position) => ({
    artistId: position.artist_id,
    shares: Number(position.shares),
    averageShortPrice: Number(position.average_short_price),
    collateral: Number(position.collateral)
  }));
}

async function loadTransactions(
  supabase: ReturnType<typeof createServiceRoleClient>,
  userId: string
): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from("market_trade_events")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    throw new Error(`Could not load transactions: ${error.message}`);
  }

  return ((data ?? []) as TransactionRow[]).map((transaction) => ({
    id: transaction.id,
    artistId: transaction.artist_id,
    type: transaction.type,
    shares: Number(transaction.shares),
    price: Number(transaction.price),
    grossValue: Number(transaction.gross_value ?? Math.abs(transaction.cash_delta)),
    commission: Number(transaction.commission ?? 0),
    marketEligible: Boolean(transaction.market_eligible ?? true),
    createdAt: transaction.created_at
  }));
}

async function parseBody(request: Request): Promise<BootstrapBody> {
  try {
    return (await request.json()) as BootstrapBody;
  } catch {
    return {};
  }
}

function normalizeUsername(username: unknown, email: string | undefined) {
  const provided = typeof username === "string" && Boolean(username.trim());
  const raw = provided ? username : email?.split("@")[0] ?? "trader";
  const normalized = raw.normalize("NFKC").trim().slice(0, 32);

  if (provided && !/^[A-Za-z0-9_.-]{2,32}$/.test(normalized)) {
    throw new Error("Username must be 2-32 characters using letters, numbers, periods, hyphens, or underscores.");
  }

  const fallback = normalized.replace(/[^A-Za-z0-9_.-]/g, "");

  return fallback.length >= 2 ? fallback : "trader";
}

function formatProfileWriteError(message: string) {
  if (isDuplicateKeyError(message)) {
    return "That username is already taken.";
  }

  if (message.toLowerCase().includes("avatar_url")) {
    return "Profile pictures are not ready yet. Run Supabase migration 020_profile_avatar.sql first.";
  }

  if (
    message.toLowerCase().includes("favorite_genres") ||
    message.toLowerCase().includes("profile_is_public") ||
    message.toLowerCase().includes("portfolio_is_public") ||
    message.toLowerCase().includes("onboarding_completed") ||
    message.toLowerCase().includes("market_impact_exempt") ||
    message.toLowerCase().includes("is_admin")
  ) {
    return "Account preferences are not ready yet. Run Supabase migration 022_account_privacy_and_onboarding.sql first.";
  }

  if (message.toLowerCase().includes("bio") || message.toLowerCase().includes("favorite_artist_ids")) {
    return "Profile details are not ready yet. Run Supabase migration 019_profile_details.sql first.";
  }

  return message;
}

function isDuplicateKeyError(message: string) {
  return message.toLowerCase().includes("duplicate key") || message.includes("23505");
}

function buildFallbackUsername(username: string, userId: string) {
  const suffix = userId.replace(/[^A-Za-z0-9]/g, "").slice(0, 6).toLowerCase();
  const base = username.slice(0, Math.max(2, 31 - suffix.length)).replace(/[_.-]+$/, "") || "trader";

  return `${base}_${suffix}`.slice(0, 32);
}

function normalizeBio(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 280);
}

function normalizeFavoriteArtistIds(value: string[]) {
  return Array.from(
    new Set(
      value
        .filter((artistId) => typeof artistId === "string")
        .map((artistId) => artistId.trim())
        .filter(Boolean)
    )
  ).slice(0, 12);
}

const ALLOWED_GENRES = new Set([
  "alternative",
  "conscious",
  "drill",
  "experimental",
  "mainstream",
  "melodic",
  "southern",
  "trap",
  "underground"
]);

function normalizeFavoriteGenres(value: string[]) {
  return Array.from(
    new Set(
      value
        .filter((genre) => typeof genre === "string")
        .map((genre) => genre.trim().toLowerCase())
        .filter((genre) => ALLOWED_GENRES.has(genre))
    )
  ).slice(0, MAX_FAVORITE_GENRES);
}

async function assertOnboardingSelection({
  supabase,
  favoriteGenres,
  favoriteArtistIds
}: {
  supabase: ReturnType<typeof createServiceRoleClient>;
  favoriteGenres: string[];
  favoriteArtistIds: string[];
}) {
  if (!favoriteGenres.length) {
    throw new Error("Choose at least one rap lane before finishing account setup.");
  }

  if (favoriteArtistIds.length < MIN_FAVORITE_ARTISTS) {
    throw new Error("Choose at least three artists before finishing account setup.");
  }

  if (favoriteArtistIds.length > MAX_FAVORITE_ARTISTS) {
    throw new Error("Choose no more than five artists before finishing account setup.");
  }

  const { count, error } = await supabase
    .from("artists")
    .select("id", { count: "exact", head: true })
    .in("id", favoriteArtistIds)
    .eq("is_active", true);

  if (error || (count ?? 0) < MIN_FAVORITE_ARTISTS) {
    throw new Error("Choose at least three active artists before finishing account setup.");
  }
}

function getProfileBio(profile: ProfileRow) {
  return typeof profile.bio === "string" ? profile.bio : "";
}

function getFavoriteArtistIds(profile: ProfileRow) {
  return Array.isArray(profile.favorite_artist_ids)
    ? profile.favorite_artist_ids.filter((artistId): artistId is string => typeof artistId === "string")
    : [];
}

function getFavoriteGenres(profile: ProfileRow) {
  return Array.isArray(profile.favorite_genres)
    ? profile.favorite_genres.filter((genre): genre is string => typeof genre === "string")
    : [];
}

function getAvatarUrl(profile: ProfileRow) {
  return typeof profile.avatar_url === "string" ? profile.avatar_url : "";
}
