import { NextResponse } from "next/server";
import { requireAdminRequest } from "@/server/admin-auth";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { recoverAppleChartObservations } from "@/server/market/apple-chart-recovery";
import { getMarketDate } from "@/server/market/market-date";
import { reportServerError } from "@/server/observability";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request) {
  const auth = await requireAdminRequest(request, { allowMarketSecret: true });
  if (!auth.ok) return auth.response;
  const runDate = getMarketDate();
  try {
    const recovery = await recoverAppleChartObservations(createServiceRoleClient(), runDate);
    return NextResponse.json({ ok: true, runDate, ...recovery });
  } catch (error) {
    reportServerError(error, "market.chart-recovery");
    return NextResponse.json({ ok: false, runDate, error: "Chart observations could not be refreshed." }, { status: 500 });
  }
}
