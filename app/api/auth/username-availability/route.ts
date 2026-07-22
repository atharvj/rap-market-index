import { NextResponse } from "next/server";
import { getUsernameValidationError, normalizeUsernameInput, normalizeUsernameKey } from "@/lib/username";
import { createServiceRoleClient, getSupabaseConfigStatus } from "@/lib/supabase/server";
import { enforceRateLimit, getRequestIp } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store, max-age=0" };

export async function POST(request: Request) {
  if (!getSupabaseConfigStatus().serviceRoleConfigured) {
    return NextResponse.json(
      { ok: false, error: "Username checking is temporarily unavailable." },
      { status: 503, headers: PRIVATE_HEADERS }
    );
  }

  const limited = await enforceRateLimit({
    request,
    identifier: getRequestIp(request),
    scope: "username-availability",
    limit: 30,
    windowSeconds: 300
  });

  if (limited) {
    return limited;
  }

  const body = await parseBody(request);
  const username = typeof body.username === "string" ? normalizeUsernameInput(body.username) : "";
  const validationError = getUsernameValidationError(username);

  if (validationError) {
    return NextResponse.json(
      { ok: false, available: false, error: validationError },
      { status: 400, headers: PRIVATE_HEADERS }
    );
  }

  const escapedUsername = username.replace(/[\\%_]/g, (character) => `\\${character}`);
  const { data, error } = await createServiceRoleClient()
    .from("profiles")
    .select("username")
    .ilike("username", escapedUsername)
    .limit(5);

  if (error) {
    return NextResponse.json(
      { ok: false, error: "Could not check that username." },
      { status: 500, headers: PRIVATE_HEADERS }
    );
  }

  const usernameKey = normalizeUsernameKey(username);
  const available = !(data ?? []).some((profile) => normalizeUsernameKey(profile.username) === usernameKey);

  return NextResponse.json(
    {
      ok: true,
      available,
      username,
      error: available ? undefined : "That username is already taken."
    },
    { headers: PRIVATE_HEADERS }
  );
}

async function parseBody(request: Request): Promise<{ username?: unknown }> {
  try {
    return await request.json() as { username?: unknown };
  } catch {
    return {};
  }
}
