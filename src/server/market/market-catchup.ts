import "server-only";
import type { createServiceRoleClient } from "@/lib/supabase/server";
import { loadAllPages } from "@/lib/pagination";
import { getMarketDate } from "@/server/market/market-date";
import { loadReleaseWindowStatus } from "@/server/market/release-window";
import { claimAutomationWindow } from "@/server/market/automation-lease";
import { readAutomationResponse } from "@/server/market/automation-response";
import { reportServerError } from "@/server/observability";

const PRODUCTION_ORIGIN = "https://rap-market-index.vercel.app";
const STALE_AFTER_MS = 30 * 60 * 1000;

export function hasStaleMarketCoverage(artistIds: string[], rows: Array<{ artist_id: string; observed_at: string }>, now = Date.now()) {
  const latest = new Map<string, number>();
  for (const row of rows) {
    const time = Date.parse(row.observed_at);
    if (Number.isFinite(time)) latest.set(row.artist_id, Math.max(latest.get(row.artist_id) ?? 0, time));
  }
  return artistIds.some(id => {
    const time = latest.get(id);
    return time === undefined || time > now + 60_000 || now - time >= STALE_AFTER_MS;
  });
}

// Invoked through Next's after(), after a successful public market response.
// No request URL, visitor input, identity, or secret reaches the browser.
export async function recoverStaleMarket({ supabase, artistIds, now = Date.now(), fetchImpl = fetch }: {
  supabase: ReturnType<typeof createServiceRoleClient>; artistIds: string[]; now?: number; fetchImpl?: typeof fetch;
}) {
  const secret = process.env.MARKET_UPDATE_SECRET?.trim();
  if (!secret || !artistIds.length) return { attempted: false, reason: "not_configured" };
  const runDate = getMarketDate(new Date(now));
  const rows = await loadAllPages(async (from, to) => {
    const { data, error } = await supabase.from("market_observations")
      .select("artist_id,observed_at").eq("source", "market_refresh").eq("metric", "completed")
      .eq("observed_date", runDate).in("artist_id", artistIds).order("artist_id").range(from, to);
    if (error) throw new Error("Could not verify market freshness for background recovery.");
    return data ?? [];
  });
  if (!hasStaleMarketCoverage(artistIds, rows, now)) return { attempted: false, reason: "fresh" };
  if (!await claimAutomationWindow(supabase, "market-visitor-recovery", 900)) return { attempted: false, reason: "throttled" };
  const opening = await loadReleaseWindowStatus(supabase, new Date(now));
  const path = opening.ready ? "/api/cron/catalyst-refresh" : "/api/cron/release-window";
  const invoke = async (endpoint: string, timeout: number) => {
    const response = await fetchImpl(PRODUCTION_ORIGIN + endpoint, {
      headers: { "x-market-update-secret": secret }, signal: AbortSignal.timeout(timeout),
      cache: "no-store", redirect: "error"
    });
    const payload = await readAutomationResponse(response);
    if (!response.ok || payload.ok !== true) throw new Error(`Background market recovery failed at ${endpoint} (HTTP ${response.status}).`);
    return { skipped: payload.skipped === true };
  };
  // Intraday pricing does not collect Apple charts, so recovery can run alongside
  // it. The daily opening already collects them and must not race a second scan.
  const jobs = [invoke(path, 290_000)];
  if (opening.ready) jobs.push(invoke("/api/cron/chart-recovery", 110_000));
  const results = await Promise.allSettled(jobs);
  for (const result of results) if (result.status === "rejected") reportServerError(result.reason, "market.background-recovery");
  return { attempted: true, kind: opening.ready ? "intraday" : "opening", completed: results[0].status === "fulfilled" && !results[0].value.skipped };
}
