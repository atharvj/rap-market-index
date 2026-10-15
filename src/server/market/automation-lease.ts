import "server-only";
import { createHash } from "node:crypto";
import type { createServiceRoleClient } from "@/lib/supabase/server";

type Client = ReturnType<typeof createServiceRoleClient>;

// The existing atomic database limiter works across all Vercel instances.
// Fail closed: an instance-local fallback would permit overlapping price jobs.
export async function claimAutomationWindow(supabase: Client, scope = "market-automation", seconds = 900) {
  const { data, error } = await supabase.rpc("consume_api_rate_limit", {
    p_key_hash: createHash("sha256").update(`rmi:${scope}`).digest("hex"),
    p_scope: scope,
    p_limit: 1,
    p_window_seconds: seconds
  });
  if (error || !data?.[0] || typeof data[0].allowed !== "boolean") {
    throw new Error("Could not acquire the distributed market automation window.");
  }
  return data[0].allowed;
}
