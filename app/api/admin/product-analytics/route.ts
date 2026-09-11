import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { requireAdminRequest } from "@/server/admin-auth";
import { reportServerError } from "@/server/observability";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0" };

export async function GET(request: Request) {
  const auth = await requireAdminRequest(request, { allowMarketSecret: false });

  if (!auth.ok) {
    return auth.response;
  }

  const url = new URL(request.url);
  const requestedDays = Number(url.searchParams.get("days") ?? 30);
  const days = Number.isFinite(requestedDays)
    ? Math.max(1, Math.min(180, Math.floor(requestedDays)))
    : 30;

  try {
    const { data, error } = await createServiceRoleClient().rpc("get_product_analytics_summary", {
      p_days: days
    });

    if (error) {
      throw error;
    }

    return NextResponse.json(
      {
        ok: true,
        summary: data
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    reportServerError(error, "admin.product-analytics");
    const message = error && typeof error === "object" && "message" in error && typeof error.message === "string"
      ? error.message : "";
    const migrationPending = /get_product_analytics_summary|product_analytics_events|schema cache|does not exist/i.test(message);

    return NextResponse.json(
      {
        ok: false,
        error: migrationPending
          ? "Product analytics needs database migration 044_product_analytics.sql."
          : "Product analytics could not be loaded."
      },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
