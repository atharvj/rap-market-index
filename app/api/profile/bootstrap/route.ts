import { NextResponse } from "next/server";
import { createAnonServerClient, getSupabaseConfigStatus } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import type { Holding, ShortPosition, Transaction } from "@/lib/types";

export const dynamic = "force-dynamic";

type BootstrapBody = {
  username?: string;
};

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type HoldingRow = Database["public"]["Tables"]["holdings"]["Row"];
type ShortPositionRow = Database["public"]["Tables"]["short_positions"]["Row"];
type TransactionRow = Database["public"]["Views"]["market_trade_events"]["Row"];

export async function POST(request: Request) {
  const config = getSupabaseConfigStatus();

  if (!config.readyForPublicReads) {
    return NextResponse.json(
      {
        ok: false,
        error: "Supabase is not configured yet.",
        config
      },
      { status: 400 }
    );
  }

  const authorization = request.headers.get("authorization");

  if (!authorization) {
    return NextResponse.json(
      {
        ok: false,
        error: "Missing Supabase authorization token."
      },
      { status: 401 }
    );
  }

  try {
    const body = await parseBody(request);
    const supabase = createAnonServerClient(authorization);
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user) {
      return NextResponse.json(
        {
          ok: false,
          error: userError?.message ?? "Could not resolve signed-in user."
        },
        { status: 401 }
      );
    }

    const [profile, holdings, shortPositions, transactions] = await Promise.all([
      getOrCreateProfile({
        supabase,
        userId: userData.user.id,
        email: userData.user.email,
        username: body.username ?? userData.user.user_metadata?.username
      }),
      loadHoldings(supabase, userData.user.id),
      loadShortPositions(supabase, userData.user.id),
      loadTransactions(supabase, userData.user.id)
    ]);

    return NextResponse.json({
      ok: true,
      profile: {
        id: profile.id,
        username: profile.username,
        cashBalance: Number(profile.cash_balance)
      },
      holdings,
      shortPositions,
      transactions,
      config
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Could not bootstrap profile.",
        config
      },
      { status: 500 }
    );
  }
}

async function getOrCreateProfile({
  supabase,
  userId,
  email,
  username
}: {
  supabase: ReturnType<typeof createAnonServerClient>;
  userId: string;
  email?: string;
  username?: string;
}) {
  const existing = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();

  if (existing.error) {
    throw new Error(`Could not load profile: ${existing.error.message}`);
  }

  if (existing.data) {
    const profile = existing.data as ProfileRow;
    const preferredUsername =
      typeof username === "string" && username.trim() ? normalizeUsername(username, undefined) : null;

    if (preferredUsername && preferredUsername !== profile.username) {
      const updated = await supabase
        .from("profiles")
        .update({
          username: preferredUsername
        })
        .eq("id", userId)
        .select("*")
        .single();

      if (updated.error) {
        throw new Error(formatProfileWriteError(updated.error.message));
      }

      return updated.data as ProfileRow;
    }

    return profile;
  }

  const safeUsername = normalizeUsername(username, email);
  const inserted = await supabase
    .from("profiles")
    .insert({
      id: userId,
      username: safeUsername
    })
    .select("*")
    .single();

  if (inserted.error) {
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
  supabase: ReturnType<typeof createAnonServerClient>,
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
  const raw = typeof username === "string" && username.trim() ? username : email?.split("@")[0] ?? "trader";
  const normalized = raw.trim().slice(0, 32);

  return normalized || "trader";
}

function formatProfileWriteError(message: string) {
  if (message.toLowerCase().includes("duplicate key")) {
    return "That username is already taken.";
  }

  return message;
}
