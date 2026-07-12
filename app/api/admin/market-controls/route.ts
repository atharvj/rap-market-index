import { NextResponse } from "next/server";
import { createServiceRoleClient, getSupabaseConfigStatus } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/database.types";
import { requireAdminRequest } from "@/server/admin-auth";

export const dynamic = "force-dynamic";

type MarketControlBody = {
  tradingMode?: "continuous" | "halted" | "maintenance";
  allowTrading?: boolean;
  allowMarketImpact?: boolean;
  statusNote?: string;
  artistHalts?: Array<{
    artistId?: string;
    isHalted?: boolean;
    reason?: string;
    endsAt?: string | null;
  }>;
};

export async function GET(request: Request) {
  const auth = await requireAdminRequest(request);

  if (!auth.ok) {
    return auth.response;
  }

  const config = getSupabaseConfigStatus();

  if (!config.readyForAdminWrites) {
    return NextResponse.json(
      {
        ok: false,
        error: "Supabase admin credentials are not configured.",
        config
      },
      { status: 500 }
    );
  }

  try {
    const supabase = createServiceRoleClient();
    const controls = await supabase.from("market_controls").select("*").eq("id", true).maybeSingle();
    const halts = await supabase
      .from("artist_trading_halts")
      .select("artist_id,is_halted,reason,starts_at,ends_at,created_at,updated_at")
      .eq("is_halted", true)
      .order("starts_at", { ascending: false });

    if (controls.error) {
      throw new Error(controls.error.message);
    }

    if (halts.error) {
      throw new Error(halts.error.message);
    }

    return NextResponse.json({
      ok: true,
      controls: controls.data,
      activeHalts: halts.data ?? []
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Could not load market controls."
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  const auth = await requireAdminRequest(request);

  if (!auth.ok) {
    return auth.response;
  }

  const config = getSupabaseConfigStatus();

  if (!config.readyForAdminWrites) {
    return NextResponse.json(
      {
        ok: false,
        error: "Supabase admin credentials are not configured.",
        config
      },
      { status: 500 }
    );
  }

  const body = await parseBody(request);
  const validation = validateBody(body);

  if (!validation.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: validation.error
      },
      { status: 400 }
    );
  }

  try {
    const supabase = createServiceRoleClient();
    const controlPatch: Database["public"]["Tables"]["market_controls"]["Update"] = {};

    if (body.tradingMode) {
      controlPatch.trading_mode = body.tradingMode;
    }

    if (typeof body.allowTrading === "boolean") {
      controlPatch.allow_trading = body.allowTrading;
    }

    if (typeof body.allowMarketImpact === "boolean") {
      controlPatch.allow_market_impact = body.allowMarketImpact;
    }

    if (typeof body.statusNote === "string") {
      controlPatch.status_note = body.statusNote.trim() || "Continuous virtual trading is open.";
    }

    if (Object.keys(controlPatch).length > 0) {
      const { error } = await supabase.from("market_controls").update(controlPatch).eq("id", true);

      if (error) {
        throw new Error(error.message);
      }
    }

    for (const halt of body.artistHalts ?? []) {
      if (!halt.artistId) {
        continue;
      }

      if (halt.isHalted === false) {
        const { error } = await supabase
          .from("artist_trading_halts")
          .update({
            is_halted: false,
            ends_at: new Date().toISOString()
          })
          .eq("artist_id", halt.artistId);

        if (error) {
          throw new Error(error.message);
        }

        continue;
      }

      const { error } = await supabase.from("artist_trading_halts").upsert({
        artist_id: halt.artistId,
        is_halted: true,
        reason: halt.reason?.trim() || "Trading halted for review.",
        starts_at: new Date().toISOString(),
        ends_at: halt.endsAt ?? null
      });

      if (error) {
        throw new Error(error.message);
      }
    }

    await recordMarketControlAction({
      supabase,
      actorUserId: auth.user?.id ?? null,
      body
    });

    return NextResponse.json({
      ok: true
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Could not update market controls."
      },
      { status: 500 }
    );
  }
}

async function recordMarketControlAction({
  supabase,
  actorUserId,
  body
}: {
  supabase: ReturnType<typeof createServiceRoleClient>;
  actorUserId: string | null;
  body: MarketControlBody;
}) {
  const hasControlChange = Boolean(
    body.tradingMode ||
    typeof body.allowTrading === "boolean" ||
    typeof body.allowMarketImpact === "boolean" ||
    typeof body.statusNote === "string"
  );
  const action = hasControlChange ? "update_market_controls" : "update_artist_halts";
  const { error } = await supabase.from("admin_action_log").insert({
    actor_user_id: actorUserId,
    target_user_id: null,
    action,
    reason: body.statusNote?.trim().slice(0, 500) ?? body.artistHalts?.[0]?.reason?.trim().slice(0, 500) ?? "",
    details: body as unknown as Json
  });

  if (error && !error.message.toLowerCase().includes("admin_action_log")) {
    throw new Error(`Market controls changed, but the operator audit log failed: ${error.message}`);
  }
}

async function parseBody(request: Request): Promise<MarketControlBody> {
  try {
    return (await request.json()) as MarketControlBody;
  } catch {
    return {};
  }
}

function validateBody(body: MarketControlBody): { ok: true } | { ok: false; error: string } {
  const hasChange = Boolean(
    body.tradingMode ||
    typeof body.allowTrading === "boolean" ||
    typeof body.allowMarketImpact === "boolean" ||
    typeof body.statusNote === "string" ||
    body.artistHalts?.length
  );

  if (!hasChange) {
    return { ok: false, error: "At least one market control change is required." };
  }

  if (
    body.tradingMode &&
    body.tradingMode !== "continuous" &&
    body.tradingMode !== "halted" &&
    body.tradingMode !== "maintenance"
  ) {
    return { ok: false, error: "tradingMode must be continuous, halted, or maintenance." };
  }

  for (const halt of body.artistHalts ?? []) {
    if (!halt.artistId) {
      return { ok: false, error: "artistHalts entries must include artistId." };
    }

    if (halt.endsAt && Number.isNaN(new Date(halt.endsAt).getTime())) {
      return { ok: false, error: "artistHalts endsAt must be an ISO date or null." };
    }
  }

  return { ok: true };
}
