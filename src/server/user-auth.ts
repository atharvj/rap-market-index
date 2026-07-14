import "server-only";
import { NextResponse } from "next/server";
import { createAnonServerClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

type ConfirmedUserSuccess = {
  ok: true;
  supabase: ReturnType<typeof createAnonServerClient>;
  user: User;
};

type ConfirmedUserFailure = {
  ok: false;
  response: NextResponse;
};

export async function requireConfirmedUser(request: Request): Promise<ConfirmedUserSuccess | ConfirmedUserFailure> {
  const authorization = request.headers.get("authorization");

  if (!authorization) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "Sign in is required." }, { status: 401 })
    };
  }

  const supabase = createAnonServerClient(authorization);
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "Your session could not be verified." },
        { status: 401 }
      )
    };
  }

  if (!data.user.email || !data.user.email_confirmed_at) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "Confirm your email address before using this account." },
        { status: 403 }
      )
    };
  }

  return {
    ok: true,
    supabase,
    user: data.user
  };
}
