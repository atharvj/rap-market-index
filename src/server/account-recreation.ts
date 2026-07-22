import "server-only";
import { createHmac } from "node:crypto";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

export const ACCOUNT_RECREATION_COOLDOWN_DAYS = 30;
export const ACCOUNT_RECREATION_ACTION = "account_self_delete";

type ServiceClient = SupabaseClient<Database>;

export function getAccountIdentifierHash(email: string) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!key) {
    throw new Error("Account recreation protection is not configured.");
  }

  return createHmac("sha256", key)
    .update(`rmi-account-recreation:v1:${email.normalize("NFKC").trim().toLocaleLowerCase("en-US")}`)
    .digest("hex");
}

export async function recordAccountDeletionCooldown({
  supabase,
  userId,
  email
}: {
  supabase: ServiceClient;
  userId: string;
  email: string;
}) {
  const deletedAt = new Date();
  const cooldownUntil = new Date(deletedAt);
  cooldownUntil.setUTCDate(cooldownUntil.getUTCDate() + ACCOUNT_RECREATION_COOLDOWN_DAYS);

  const { data, error } = await supabase
    .from("admin_action_log")
    .insert({
      actor_user_id: userId,
      target_user_id: userId,
      action: ACCOUNT_RECREATION_ACTION,
      reason: "User-requested account deletion",
      details: {
        identifierHash: getAccountIdentifierHash(email),
        cooldownUntil: cooldownUntil.toISOString(),
        retentionPurpose: "fair_play_account_recreation_cooldown"
      }
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Could not record the account recreation cooldown: ${error?.message ?? "Unknown error"}`);
  }

  return {
    logId: data.id,
    cooldownUntil: cooldownUntil.toISOString()
  };
}

export async function removeAccountDeletionCooldown(supabase: ServiceClient, logId: string) {
  await supabase.from("admin_action_log").delete().eq("id", logId);
}

export async function deleteExpiredAccountRecreationCooldowns({
  supabase,
  now = new Date()
}: {
  supabase: ServiceClient;
  now?: Date;
}) {
  const { data, error } = await supabase
    .from("admin_action_log")
    .delete()
    .eq("action", ACCOUNT_RECREATION_ACTION)
    .lt("details->>cooldownUntil", now.toISOString())
    .select("id");

  if (error) {
    throw new Error(`Could not remove expired account recreation cooldowns: ${error.message}`);
  }

  return data?.length ?? 0;
}

export async function getActiveAccountRecreationCooldown({
  supabase,
  email,
  now = new Date()
}: {
  supabase: ServiceClient;
  email: string;
  now?: Date;
}) {
  const identifierHash = getAccountIdentifierHash(email);
  const { data, error } = await supabase
    .from("admin_action_log")
    .select("id,details,created_at")
    .eq("action", ACCOUNT_RECREATION_ACTION)
    .contains("details", { identifierHash })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not verify account recreation eligibility: ${error.message}`);
  }

  const cooldownUntil = readCooldownUntil(data?.details);

  if (!cooldownUntil || cooldownUntil.getTime() <= now.getTime()) {
    if (data?.id) {
      await removeAccountDeletionCooldown(supabase, data.id);
    }
    return null;
  }

  return {
    cooldownUntil: cooldownUntil.toISOString()
  };
}

function readCooldownUntil(details: Json | undefined) {
  if (!details || Array.isArray(details) || typeof details !== "object") {
    return null;
  }

  const value = details.cooldownUntil;

  if (typeof value !== "string") {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
