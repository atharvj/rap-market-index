import "server-only";

import { createHash, createHmac } from "node:crypto";
import type { Database } from "@/lib/supabase/database.types";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { ProductAuthMethod, ValidatedProductAnalyticsEvent } from "@/lib/product-analytics";

type ProductAnalyticsClient = ReturnType<typeof createServiceRoleClient>;
type ProductAnalyticsInsert = Database["public"]["Tables"]["product_analytics_events"]["Insert"];
type ServerProductEvent = {
  eventName: "signup_completed" | "first_trade";
  userId: string;
  occurredAt?: string;
  artistId?: string;
  authMethod?: ProductAuthMethod;
  action?: "buy" | "sell" | "short" | "cover";
};

const analyticsWarnings = globalThis as typeof globalThis & {
  __rmiAnalyticsStorageWarning?: boolean;
};

export async function recordPublicProductEvent({
  event,
  userId,
  supabase = createServiceRoleClient()
}: {
  event: ValidatedProductAnalyticsEvent;
  userId: string | null;
  supabase?: ProductAnalyticsClient;
}) {
  const eventIdentity = buildPublicEventIdentity(event);
  const row: ProductAnalyticsInsert = {
    event_name: event.eventName,
    dedupe_key: hashAnalyticsIdentifier(eventIdentity),
    visitor_hash: hashAnalyticsIdentifier(`visitor:${event.visitorId}`),
    session_hash: hashAnalyticsIdentifier(`session:${event.sessionId}`),
    user_id: userId,
    path: event.path,
    artist_id: event.artistId,
    auth_method: event.authMethod,
    campaign_source: event.campaignSource,
    campaign_medium: event.campaignMedium,
    campaign_name: event.campaignName,
    referrer_host: event.referrerHost
  };

  return upsertProductAnalyticsEvent(supabase, row, true);
}

export async function recordServerProductEvent({
  event,
  supabase = createServiceRoleClient()
}: {
  event: ServerProductEvent;
  supabase?: ProductAnalyticsClient;
}) {
  if (event.eventName === "first_trade") {
    try {
      const { data, error } = await supabase.from("market_trade_events")
        .select("artist_id,type,created_at").eq("user_id", event.userId)
        .order("created_at", { ascending: true }).order("id", { ascending: true }).limit(1).maybeSingle();
      if (error || !data) return false;
      event = { ...event, artistId: data.artist_id, action: data.type as ServerProductEvent["action"], occurredAt: data.created_at };
    } catch { return false; }
  }
  if (event.occurredAt && new Date(event.occurredAt).getTime() < Date.now() - 180 * 86_400_000) return true;
  const row: ProductAnalyticsInsert = {
    event_name: event.eventName,
    dedupe_key: createHash("sha256").update(`${event.eventName}:${event.userId}`).digest("hex"),
    user_id: event.userId,
    artist_id: event.artistId ?? null,
    auth_method: event.authMethod ?? null,
    action: event.action ?? null,
    occurred_at: event.occurredAt
  };

  return upsertProductAnalyticsEvent(supabase, row, false);
}

function buildPublicEventIdentity(event: ValidatedProductAnalyticsEvent) {
  if (event.eventName === "page_view") {
    return `page_view:${event.sessionId}:${event.path ?? "/"}`;
  }

  if (event.eventName === "artist_view") {
    return `artist_view:${event.sessionId}:${event.artistId}`;
  }

  if (event.eventName === "signup_started") {
    return `signup_started:${event.sessionId}:${event.authMethod}`;
  }

  return `session_start:${event.sessionId}`;
}

async function upsertProductAnalyticsEvent(
  supabase: ProductAnalyticsClient,
  row: ProductAnalyticsInsert,
  updateExisting: boolean
) {
  try {
    const { error } = await supabase.from("product_analytics_events").upsert(row, {
      onConflict: "dedupe_key", ignoreDuplicates: true
    });
    if (error) throw error;
    // Linking a newly authenticated session must preserve its original time
    // and acquisition source. A repeated page view is not a new session.
    if (updateExisting && row.user_id) {
      const linked = await supabase.from("product_analytics_events")
        .update({ user_id: row.user_id }).eq("dedupe_key", row.dedupe_key).is("user_id", null);
      if (linked.error) throw linked.error;
    }
    return true;
  } catch {
    if (!analyticsWarnings.__rmiAnalyticsStorageWarning) {
      analyticsWarnings.__rmiAnalyticsStorageWarning = true;
      console.warn("Product analytics storage is unavailable.");
    }
    return false;
  }
}

export async function pruneProductAnalyticsEvents(supabase = createServiceRoleClient()) {
  try {
    const { error } = await supabase.from("product_analytics_events").delete()
      .lt("occurred_at", new Date(Date.now() - 180 * 86_400_000).toISOString());
    return !error;
  } catch { return false; }
}

function hashAnalyticsIdentifier(value: string) {
  const secret =
    process.env.RATE_LIMIT_SECRET?.trim() ||
    process.env.MARKET_UPDATE_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (secret) {
    return createHmac("sha256", secret).update(value).digest("hex");
  }

  return createHash("sha256").update(value).digest("hex");
}
