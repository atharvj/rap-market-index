import { NextResponse } from "next/server";
import { createServiceRoleClient, getSupabaseConfigStatus } from "@/lib/supabase/server";
import { requireConfirmedUser } from "@/server/user-auth";

export const dynamic = "force-dynamic";

const MAX_AVATAR_BYTES = 3 * 1024 * 1024;
const AVATAR_UPLOAD_COOLDOWN_MS = 10_000;
const ALLOWED_TYPES: Record<string, { extension: string; valid: (bytes: Uint8Array) => boolean }> = {
  "image/jpeg": {
    extension: "jpg",
    valid: (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  },
  "image/png": {
    extension: "png",
    valid: (bytes) => [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value)
  },
  "image/webp": {
    extension: "webp",
    valid: (bytes) => readAscii(bytes, 0, 4) === "RIFF" && readAscii(bytes, 8, 12) === "WEBP"
  },
  "image/gif": {
    extension: "gif",
    valid: (bytes) => readAscii(bytes, 0, 6) === "GIF87a" || readAscii(bytes, 0, 6) === "GIF89a"
  }
};

export async function POST(request: Request) {
  const config = getSupabaseConfigStatus();

  if (!config.serviceRoleConfigured) {
    return NextResponse.json({ ok: false, error: "Profile picture storage is not configured." }, { status: 503 });
  }

  const auth = await requireConfirmedUser(request);

  if (!auth.ok) {
    return auth.response;
  }

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid image upload." }, { status: 400 });
  }

  const file = formData.get("avatar");

  if (!(file instanceof File) || file.size <= 0 || file.size > MAX_AVATAR_BYTES) {
    return NextResponse.json({ ok: false, error: "Choose an image under 3 MB." }, { status: 400 });
  }

  const type = ALLOWED_TYPES[file.type];

  if (!type) {
    return NextResponse.json({ ok: false, error: "Choose a valid JPG, PNG, WebP, or GIF image." }, { status: 400 });
  }

  const service = createServiceRoleClient();
  const path = `${auth.user.id}/avatar.${type.extension}`;
  const { data: existing } = await service.storage.from("profile-avatars").list(auth.user.id, { limit: 20 });
  const latestWriteAt = Math.max(
    0,
    ...(existing ?? []).map((object) => new Date(object.updated_at ?? object.created_at ?? 0).getTime()).filter(Number.isFinite)
  );

  if (Date.now() - latestWriteAt < AVATAR_UPLOAD_COOLDOWN_MS) {
    return NextResponse.json({ ok: false, error: "Wait a few seconds before changing the profile picture again." }, { status: 429 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  if (!type.valid(bytes)) {
    return NextResponse.json({ ok: false, error: "Choose a valid JPG, PNG, WebP, or GIF image." }, { status: 400 });
  }

  const stalePaths = (existing ?? [])
    .map((object) => `${auth.user.id}/${object.name}`)
    .filter((candidate) => candidate !== path);

  if (stalePaths.length) {
    await service.storage.from("profile-avatars").remove(stalePaths);
  }

  const { error: uploadError } = await service.storage.from("profile-avatars").upload(path, bytes, {
    cacheControl: "86400",
    contentType: file.type,
    upsert: true
  });

  if (uploadError) {
    return NextResponse.json({ ok: false, error: "Could not store the profile picture." }, { status: 500 });
  }

  const { data } = service.storage.from("profile-avatars").getPublicUrl(path);
  const avatarUrl = `${data.publicUrl}?v=${Date.now()}`;
  const { error: profileError } = await service
    .from("profiles")
    .update({ avatar_url: avatarUrl })
    .eq("id", auth.user.id);

  if (profileError) {
    await service.storage.from("profile-avatars").remove([path]);
    return NextResponse.json({ ok: false, error: "Could not attach the profile picture to this account." }, { status: 500 });
  }

  return NextResponse.json(
    { ok: true, avatarUrl },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } }
  );
}

function readAscii(bytes: Uint8Array, start: number, end: number) {
  return String.fromCharCode(...bytes.slice(start, end));
}
