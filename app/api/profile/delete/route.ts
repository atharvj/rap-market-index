import { NextResponse } from "next/server";
import { createAnonServerClient, createServiceRoleClient, getSupabaseConfigStatus } from "@/lib/supabase/server";
import { isAdminEmail } from "@/server/admin-auth";
import { enforceRateLimit } from "@/server/rate-limit";
import { requireConfirmedUser } from "@/server/user-auth";
import {
  recordAccountDeletionCooldown,
  removeAccountDeletionCooldown
} from "@/server/account-recreation";

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

  if (!auth.user.email) {
    return NextResponse.json(
      { ok: false, error: "This account does not have a verified email address." },
      { status: 400 }
    );
  }

  const hasPasswordIdentity = auth.user.identities?.some((identity) => identity.provider === "email") ?? false;

  if (hasPasswordIdentity) {
    if (!body.password || body.password.length === 0) {
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
  } else if (!wasRecentlyAuthenticated(auth.user.last_sign_in_at)) {
    return NextResponse.json(
      {
        ok: false,
        error: "For security, sign out and sign back in with Google before deleting this account."
      },
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

  let cooldown: Awaited<ReturnType<typeof recordAccountDeletionCooldown>>;

  try {
    cooldown = await recordAccountDeletionCooldown({
      supabase: service,
      userId: auth.user.id,
      email: auth.user.email
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Account deletion protection is temporarily unavailable." },
      { status: 503 }
    );
  }

  const { error: deleteError } = await service.auth.admin.deleteUser(auth.user.id);

  if (deleteError) {
    if (cooldown) {
      await removeAccountDeletionCooldown(service, cooldown.logId);
    }
    return NextResponse.json({ ok: false, error: "Could not delete the account." }, { status: 500 });
  }

  return NextResponse.json(
    { ok: true, recreationAvailableAt: cooldown?.cooldownUntil ?? null },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}

function wasRecentlyAuthenticated(lastSignInAt: string | undefined) {
  if (!lastSignInAt) {
    return false;
  }

  const elapsed = Date.now() - new Date(lastSignInAt).getTime();
  return Number.isFinite(elapsed) && elapsed >= 0 && elapsed <= 10 * 60 * 1000;
}

async function parseBody(request: Request): Promise<DeleteProfileBody> {
  try {
    return await request.json() as DeleteProfileBody;
  } catch {
    return {};
  }
}
