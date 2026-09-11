import { NextResponse } from "next/server";
import { validateProductAnalyticsEvent } from "@/lib/product-analytics";
import { getSupabaseConfigStatus } from "@/lib/supabase/server";
import { enforceRateLimit, getRequestIp } from "@/server/rate-limit";
import { recordPublicProductEvent } from "@/server/product-analytics";
import { requireConfirmedUser } from "@/server/user-auth";

export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store, max-age=0" };

export async function POST(request: Request) {
  if (request.headers.get("dnt") === "1") {
    return NextResponse.json({ ok: true }, { status: 202, headers: PRIVATE_HEADERS });
  }
  const config = getSupabaseConfigStatus();

  if (!config.serviceRoleConfigured) {
    return NextResponse.json({ ok: true }, { status: 202, headers: PRIVATE_HEADERS });
  }

  const limited = await enforceRateLimit({
    request,
    identifier: getRequestIp(request),
    scope: "product-analytics-ip",
    limit: 120,
    windowSeconds: 300
  });

  if (limited) {
    return limited;
  }

  let userId: string | null = null;

  if (request.headers.has("authorization")) {
    const auth = await requireConfirmedUser(request);

    if (auth.ok) {
      userId = auth.user.id;
    }
  }

  const body = await parseBody(request);
  const validation = validateProductAnalyticsEvent(body);

  if (!validation.ok) {
    return NextResponse.json(
      { ok: false, error: validation.error },
      { status: 400, headers: PRIVATE_HEADERS }
    );
  }

  await recordPublicProductEvent({
    event: validation.value,
    userId
  });

  return NextResponse.json({ ok: true }, { status: 202, headers: PRIVATE_HEADERS });
}

async function parseBody(request: Request): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > 4096 || !request.body) return null;
  const reader = request.body.getReader();
  try {
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}
