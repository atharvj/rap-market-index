import { NextResponse } from "next/server";
import { requireAdminRequest } from "@/server/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdminRequest(request, { allowMarketSecret: false });
  if (!auth.ok) return auth.response;
  return NextResponse.json({ ok: true, available: false, reason: "The prelaunch reset tool is retired." },
    { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const auth = await requireAdminRequest(request, { allowMarketSecret: false });
  if (!auth.ok) return auth.response;
  return NextResponse.json({ ok: false,
    error: "The prelaunch reset tool is retired. Market history and portfolios are preserved."
  }, { status: 410, headers: { "Cache-Control": "no-store" } });
}
