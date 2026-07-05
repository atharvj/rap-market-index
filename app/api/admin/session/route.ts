import { NextResponse } from "next/server";
import { requireAdminRequest } from "@/server/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdminRequest(request, {
    allowMarketSecret: false
  });

  if (!auth.ok) {
    return auth.response;
  }

  return NextResponse.json({
    ok: true,
    isAdmin: true,
    email: auth.user?.email ?? null
  });
}
