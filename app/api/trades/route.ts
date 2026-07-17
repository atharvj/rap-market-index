import { NextResponse } from "next/server";
import { createAnonServerClient, createServiceRoleClient, getSupabaseConfigStatus } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/server/rate-limit";
import { reportServerError } from "@/server/observability";
import { requireConfirmedUser } from "@/server/user-auth";

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

type PendingCatalyst = {
  title: string;
  detectedAt: string;
};

const MARKET_IMPACT_MIN_ACCOUNT_AGE_HOURS = 24;
const PENDING_CATALYST_MIN_IMPACT = 35;
const PENDING_CATALYST_MIN_CONFIDENCE = 0.65;

export async function POST(request: Request) {
  const auth = await requireConfirmedUser(request);

  if (!auth.ok) {
    return auth.response;
  }

  const userLimit = await enforceRateLimit({
    request,
    identifier: auth.user.id,
    scope: "trade-user",
    limit: 30,
    windowSeconds: 60
  });

  if (userLimit) {
    return userLimit;
  }

  const config = getSupabaseConfigStatus();

  if (!config.readyForPublicReads || !config.serviceRoleConfigured) {
    return NextResponse.json(
      {
        ok: false,
        error: "Trading is temporarily unavailable."
      },
      { status: 503 }
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

  const { supabase, user: authUser } = auth;
  const email = (authUser.email ?? "").toLowerCase();
  const impactExempt = isMarketImpactExemptEmail(email);
  const marketEligible = !impactExempt && isAccountOldEnoughForMarketImpact(authUser.created_at);

  if (impactExempt) {
    if (!config.serviceRoleConfigured) {
      return NextResponse.json({ ok: false, error: "Exempt test trading is not configured safely." }, { status: 503 });
    }

    const { error: exemptionError } = await createServiceRoleClient()
      .from("profiles")
      .update({ market_impact_exempt: true })
      .eq("id", authUser.id);

    if (exemptionError) {
      return NextResponse.json(
        { ok: false, error: "Could not verify this test account's market exemption." },
        { status: 500 }
      );
    }
  }
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

  const pendingCatalyst = await loadPendingCatalyst(
    config.serviceRoleConfigured ? createServiceRoleClient() : supabase,
    artistId
  );

  if (pendingCatalyst) {
    return NextResponse.json(
      {
        ok: false,
        error: "Trading is temporarily paused for this artist while a newly detected catalyst is incorporated into the quote.",
        pendingCatalyst
      },
      { status: 423 }
    );
  }

  const { data, error } = await createServiceRoleClient().rpc("execute_artist_trade_as_user", {
    p_user_id: authUser.id,
    p_side: side,
    p_artist_id: artistId,
    p_shares: shares,
    p_market_eligible: marketEligible
  });

  if (error) {
    reportServerError(error, "trade.execute");
    return NextResponse.json(
      {
        ok: false,
        error: getPublicTradeError(error.message)
      },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    trade: data ?? null,
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

const SAFE_TRADE_ERRORS = [
  "confirm your email before trading",
  "complete account setup before trading",
  "trading is currently paused",
  "trading is halted for this artist",
  "newly detected catalyst",
  "shares must be greater than zero",
  "share amount is too large",
  "artist not found or inactive",
  "order value must be at least",
  "not enough cash",
  "position limit is",
  "exposure limit is",
  "please wait before placing another order",
  "daily buy limit reached",
  "daily short limit reached",
  "you cannot sell more shares than you own",
  "you cannot cover more shares than you are short",
  "sell long shares before shorting",
  "cover the short position before buying"
];

function getPublicTradeError(message: string) {
  const normalized = message.toLowerCase();
  const safeMessage = SAFE_TRADE_ERRORS.find((candidate) => normalized.includes(candidate));

  if (!safeMessage) {
    return "Trade could not be completed.";
  }

  const firstLine = message.split("\n", 1)[0]?.trim();
  return firstLine || "Trade could not be completed.";
}

async function loadPendingCatalyst(
  supabase: ReturnType<typeof createAnonServerClient> | ReturnType<typeof createServiceRoleClient>,
  artistId: string
): Promise<PendingCatalyst | null> {
  const [eventResult, quoteResult] = await Promise.all([
    supabase
      .from("market_events")
      .select("title,created_at")
      .eq("artist_id", artistId)
      .gte("confidence", PENDING_CATALYST_MIN_CONFIDENCE)
      .or(`impact_score.gte.${PENDING_CATALYST_MIN_IMPACT},impact_score.lte.-${PENDING_CATALYST_MIN_IMPACT}`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("price_ticks")
      .select("observed_at")
      .eq("artist_id", artistId)
      .eq("source", "market_run")
      .order("observed_at", { ascending: false })
      .limit(1)
      .maybeSingle()
  ]);

  // Older projects may not have the event or tick migrations yet. In that case,
  // preserve trading and let the existing market-status RPC remain authoritative.
  if (eventResult.error || quoteResult.error || !eventResult.data) {
    return null;
  }

  const detectedAt = new Date(eventResult.data.created_at).getTime();
  const quotedAt = quoteResult.data ? new Date(quoteResult.data.observed_at).getTime() : Number.NEGATIVE_INFINITY;

  if (!Number.isFinite(detectedAt) || detectedAt <= quotedAt) {
    return null;
  }

  return {
    title: eventResult.data.title,
    detectedAt: eventResult.data.created_at
  };
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

  if (!body.artistId || body.artistId.length > 128 || /[\u0000-\u001f\u007f]/.test(body.artistId)) {
    return { ok: false, error: "artistId is required." };
  }

  if (
    typeof body.shares !== "number"
    || !Number.isFinite(body.shares)
    || body.shares <= 0
    || body.shares > 1_000_000
  ) {
    return { ok: false, error: "shares must be a positive number." };
  }

  return { ok: true };
}
