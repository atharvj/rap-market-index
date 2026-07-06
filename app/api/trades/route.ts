import { NextResponse } from "next/server";
import { createAnonServerClient, getSupabaseConfigStatus } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type TradeBody = {
  side?: "buy" | "sell" | "short" | "cover";
  artistId?: string;
  shares?: number;
};

type TradingStatusRow = {
  trading_mode: string;
  market_open: boolean;
  market_impact_enabled: boolean;
  artist_halted: boolean;
  reason: string;
};

const MARKET_IMPACT_MIN_ACCOUNT_AGE_HOURS = 24;

export async function POST(request: Request) {
  const config = getSupabaseConfigStatus();

  if (!config.readyForPublicReads) {
    return NextResponse.json(
      {
        ok: false,
        error: "Supabase is not configured yet. Signed-out demo trading is not saved.",
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

  const body = await parseBody(request);
  const validation = validateTradeBody(body);

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
  const shares = body.shares;
  const side = body.side;

  if (!artistId || typeof shares !== "number" || !side) {
    return NextResponse.json(
      {
        ok: false,
        error: "Invalid trade request."
      },
      { status: 400 }
    );
  }

  const supabase = createAnonServerClient(authorization);
  const user = await supabase.auth.getUser();

  if (user.error || !user.data.user?.id || !user.data.user.email) {
    return NextResponse.json(
      {
        ok: false,
        error: "You must be signed in to trade."
      },
      { status: 401 }
    );
  }

  const authUser = user.data.user;
  const email = (authUser.email ?? "").toLowerCase();
  const marketEligible = !isMarketImpactExemptEmail(email) && isAccountOldEnoughForMarketImpact(authUser.created_at);
  const tradingStatus = await loadTradingStatus(supabase, artistId);

  if (tradingStatus && !tradingStatus.market_open) {
    return NextResponse.json(
      {
        ok: false,
        error: tradingStatus.reason || "Trading is currently paused.",
        marketStatus: mapTradingStatus(tradingStatus)
      },
      { status: 423 }
    );
  }

  const functionName = getTradeFunctionName(side);
  const { data, error } = await supabase.rpc(functionName, {
    p_artist_id: artistId,
    p_shares: shares,
    p_market_eligible: marketEligible
  });

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error.message
      },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    trade: data?.[0] ?? null,
    marketStatus: tradingStatus ? mapTradingStatus(tradingStatus) : null,
    marketEligibility: {
      eligible: marketEligible,
      reason: getMarketEligibilityReason({
        email,
        createdAt: authUser.created_at
      })
    }
  });
}

async function loadTradingStatus(supabase: ReturnType<typeof createAnonServerClient>, artistId: string) {
  const { data, error } = await supabase.rpc("get_market_trading_status", {
    p_artist_id: artistId
  });

  if (error) {
    return null;
  }

  return (data?.[0] ?? null) as TradingStatusRow | null;
}

function mapTradingStatus(status: TradingStatusRow) {
  return {
    tradingMode: status.trading_mode,
    isOpen: status.market_open,
    marketImpactEnabled: status.market_impact_enabled,
    artistHalted: status.artist_halted,
    statusNote: status.reason
  };
}

function isMarketImpactExemptEmail(email: string) {
  if (!email) {
    return false;
  }

  const configured = `${process.env.MARKET_IMPACT_EXEMPT_EMAILS ?? ""},${process.env.ADMIN_EMAILS ?? ""}`
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return configured.includes(email);
}

function isAccountOldEnoughForMarketImpact(createdAt: string | undefined) {
  const createdAtMs = createdAt ? new Date(createdAt).getTime() : Number.NaN;

  if (!Number.isFinite(createdAtMs)) {
    return false;
  }

  return Date.now() - createdAtMs >= MARKET_IMPACT_MIN_ACCOUNT_AGE_HOURS * 60 * 60 * 1000;
}

function getMarketEligibilityReason({ email, createdAt }: { email: string; createdAt: string | undefined }) {
  if (isMarketImpactExemptEmail(email)) {
    return "market_impact_exempt_account";
  }

  if (!isAccountOldEnoughForMarketImpact(createdAt)) {
    return "new_account_cooldown";
  }

  return "eligible";
}

async function parseBody(request: Request): Promise<TradeBody> {
  try {
    return (await request.json()) as TradeBody;
  } catch {
    return {};
  }
}

function validateTradeBody(body: TradeBody): { ok: true } | { ok: false; error: string } {
  if (!body.side || !["buy", "sell", "short", "cover"].includes(body.side)) {
    return { ok: false, error: "Trade side must be buy, sell, short, or cover." };
  }

  if (!body.artistId) {
    return { ok: false, error: "artistId is required." };
  }

  if (typeof body.shares !== "number" || !Number.isFinite(body.shares) || body.shares <= 0) {
    return { ok: false, error: "shares must be a positive number." };
  }

  return { ok: true };
}

function getTradeFunctionName(side: NonNullable<TradeBody["side"]>) {
  if (side === "sell") {
    return "sell_artist_shares";
  }

  if (side === "short") {
    return "short_artist_shares";
  }

  if (side === "cover") {
    return "cover_artist_shares";
  }

  return "buy_artist_shares";
}
