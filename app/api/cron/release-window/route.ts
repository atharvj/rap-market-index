import { NextResponse } from "next/server";
import { createServiceRoleClient, getSupabaseConfigStatus } from "@/lib/supabase/server";
import { getMarketDate } from "@/server/market/market-date";
import { loadReleaseWindowStatus } from "@/server/market/release-window";
import { enforceRateLimit, getRequestIp } from "@/server/rate-limit";
import { secureCompare } from "@/server/secrets";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type AutomationResponse = {
  ok?: boolean;
  error?: string;
  [key: string]: unknown;
};

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Missing or invalid cron authorization." }, { status: 401 });
  }

  const limited = await enforceRateLimit({
    request,
    identifier: getRequestIp(request),
    scope: "release-window-cron",
    limit: 12,
    windowSeconds: 3600
  });

  if (limited) {
    return limited;
  }

  const config = getSupabaseConfigStatus();

  if (!config.readyForAdminWrites) {
    return NextResponse.json(
      { ok: false, error: "Release-window automation is not fully configured.", config },
      { status: 503 }
    );
  }

  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1";
  const runDate = getMarketDate();
  const secret = process.env.MARKET_UPDATE_SECRET?.trim();

  if (!secret) {
    return NextResponse.json({ ok: false, error: "MARKET_UPDATE_SECRET is not configured." }, { status: 500 });
  }

  const current = await loadReleaseWindowStatus(createServiceRoleClient());

  if (current.ready && !force) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      runDate,
      reason: "Today's release scan and market update already completed."
    });
  }

  const eventScanResponse = await fetch(new URL("/api/admin/market-event-scan", request.url), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-market-update-secret": secret
    },
    body: JSON.stringify({
      dryRun: false,
      runDate,
      artistLimit: 100,
      includeGdelt: false,
      includeMediaRss: true,
      includeAiResearch: false
    })
  });
  const eventScan = await readJson(eventScanResponse);

  if (!eventScanResponse.ok || eventScan.ok === false) {
    return NextResponse.json(
      {
        ok: false,
        runDate,
        stage: "release-scan",
        error: eventScan.error ?? "The release scan failed; trading remains paused.",
        eventScan
      },
      { status: eventScanResponse.status || 500 }
    );
  }

  const marketUpdateResponse = await fetch(new URL("/api/cron/daily-market-update", request.url), {
    headers: { "x-market-update-secret": secret }
  });
  const marketUpdate = await readJson(marketUpdateResponse);

  if (!marketUpdateResponse.ok || marketUpdate.ok === false) {
    return NextResponse.json(
      {
        ok: false,
        runDate,
        stage: "market-update",
        error: marketUpdate.error ?? "The market update failed; trading remains paused.",
        eventScan,
        marketUpdate
      },
      { status: marketUpdateResponse.status || 500 }
    );
  }

  const completed = await loadReleaseWindowStatus(createServiceRoleClient());

  if (!completed.ready) {
    return NextResponse.json(
      {
        ok: false,
        runDate,
        stage: "verification",
        error: "The update returned without a verified completed market run; trading remains paused.",
        eventScan,
        marketUpdate
      },
      { status: 503 }
    );
  }

  return NextResponse.json({ ok: true, runDate, eventScan, marketUpdate });
}

function isAuthorized(request: Request) {
  const authorization = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET?.trim();
  const marketSecret = process.env.MARKET_UPDATE_SECRET?.trim();

  return (
    secureCompare(authorization, cronSecret ? `Bearer ${cronSecret}` : null)
    || secureCompare(request.headers.get("x-market-update-secret"), marketSecret)
    || secureCompare(authorization, marketSecret ? `Bearer ${marketSecret}` : null)
  );
}

async function readJson(response: Response): Promise<AutomationResponse> {
  try {
    return await response.json() as AutomationResponse;
  } catch {
    return { ok: false, error: `Automation endpoint returned HTTP ${response.status}.` };
  }
}
