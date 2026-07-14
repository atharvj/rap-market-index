import { NextResponse } from "next/server";
import { createAnonServerClient, createServiceRoleClient, getSupabaseConfigStatus } from "@/lib/supabase/server";
import { isAdminEmail } from "@/server/admin-auth";
import { enforceRateLimit } from "@/server/rate-limit";
import { requireConfirmedUser } from "@/server/user-auth";

export const dynamic = "force-dynamic";

type DeleteProfileBody = {
  confirmation?: string;
  password?: string;
  captchaToken?: string;
};

export async function DELETE(request: Request) {
  const config = getSupabaseConfigStatus();

  if (!config.serviceRoleConfigured) {
    return NextResponse.json({ ok: false, error: "Account deletion is not configured." }, { status: 503 });
  }

  const auth = await requireConfirmedUser(request);

  if (!auth.ok) {
    return auth.response;
  }

  const limited = await enforceRateLimit({
    request,
    identifier: auth.user.id,
    scope: "account-delete",
    limit: 5,
    windowSeconds: 3600
  });

  if (limited) {
    return limited;
  }

  if (isAdminEmail(auth.user.email)) {
    return NextResponse.json(
      { ok: false, error: "Administrator accounts cannot be deleted from the public account screen." },
      { status: 403 }
    );
  }

  const body = await parseBody(request);
  const service = createServiceRoleClient();
  const { data: profile, error: profileError } = await service
    .from("profiles")
    .select("id,username")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json({ ok: false, error: "Could not verify the account." }, { status: 500 });
  }

  if (!profile) {
    return NextResponse.json({ ok: false, error: "Profile not found." }, { status: 404 });
  }

  if (body.confirmation?.trim() !== profile.username) {
    return NextResponse.json(
      { ok: false, error: `Type ${profile.username} exactly to confirm account deletion.` },
      { status: 400 }
    );
  }

  if (!body.password || body.password.length < 8 || !auth.user.email) {
    return NextResponse.json(
      { ok: false, error: "Enter your password to confirm account deletion." },
      { status: 400 }
    );
  }

  const { data: reauthentication, error: reauthenticationError } = await createAnonServerClient().auth.signInWithPassword({
    email: auth.user.email,
    password: body.password,
    options: body.captchaToken ? { captchaToken: body.captchaToken } : undefined
  });

  if (reauthenticationError || reauthentication.user?.id !== auth.user.id) {
    return NextResponse.json(
      { ok: false, error: "The password was not accepted." },
      { status: 403 }
    );
  }

  const { data: avatarObjects } = await service.storage.from("profile-avatars").list(auth.user.id, {
    limit: 100
  });

  if (avatarObjects?.length) {
    await service.storage
      .from("profile-avatars")
      .remove(avatarObjects.map((object) => `${auth.user.id}/${object.name}`));
  }

  const { error: deleteError } = await service.auth.admin.deleteUser(auth.user.id);

  if (deleteError) {
    return NextResponse.json({ ok: false, error: "Could not delete the account." }, { status: 500 });
  }

  return NextResponse.json(
    { ok: true },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}

async function parseBody(request: Request): Promise<DeleteProfileBody> {
  try {
    return await request.json() as DeleteProfileBody;
  } catch {
    return {};
  }
}
