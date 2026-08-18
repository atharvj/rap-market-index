import { NextResponse } from "next/server";
import { createServiceRoleClient, getSupabaseConfigStatus } from "@/lib/supabase/server";
import { mapMarketTradeEvent, type MarketTradeEventRow } from "@/server/market-trade-events";
import { reportServerError } from "@/server/observability";
import { enforceRateLimit } from "@/server/rate-limit";
import { requireConfirmedUser } from "@/server/user-auth";

export const dynamic = "force-dynamic";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const PRIVATE_HEADERS = { "Cache-Control": "private, no-store, max-age=0" };

export async function GET(request: Request) {
  const config = getSupabaseConfigStatus();

  if (!config.readyForPublicReads || !config.serviceRoleConfigured) {
    return NextResponse.json(
      { ok: false, error: "Transaction history is temporarily unavailable." },
      { status: 503, headers: PRIVATE_HEADERS }
    );
  }

  try {
    const auth = await requireConfirmedUser(request);

    if (!auth.ok) {
      return auth.response;
    }

    const limited = await enforceRateLimit({
      request,
      identifier: auth.user.id,
      scope: "profile-transactions",
      limit: 120,
      windowSeconds: 300
    });

    if (limited) {
      return limited;
    }

    const url = new URL(request.url);
    const page = getPositiveInteger(url.searchParams.get("page"), 1, 10_000);
    const pageSize = getPositiveInteger(url.searchParams.get("pageSize"), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const supabase = createServiceRoleClient();
    const { data, error, count } = await supabase
      .from("market_trade_events")
      .select("*", { count: "exact" })
      .eq("user_id", auth.user.id)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      throw new Error(`Could not load transaction history: ${error.message}`);
    }

    const totalCount = count ?? 0;
    const totalPages = totalCount > 0 ? Math.ceil(totalCount / pageSize) : 0;

    return NextResponse.json(
      {
        ok: true,
        transactions: ((data ?? []) as MarketTradeEventRow[]).map(mapMarketTradeEvent),
        pagination: {
          page,
          pageSize,
          totalCount,
          totalPages,
          hasPrevious: page > 1,
          hasNext: page < totalPages
        }
      },
      { headers: PRIVATE_HEADERS }
    );
  } catch (error) {
    reportServerError(error, "profile.transactions");
    return NextResponse.json(
      { ok: false, error: "Could not load transaction history." },
      { status: 500, headers: PRIVATE_HEADERS }
    );
  }
}

function getPositiveInteger(value: string | null, fallback: number, maximum: number) {
  const parsed = Number.parseInt(value ?? "", 10);

  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}
