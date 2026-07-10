import { NextResponse } from "next/server";
import { createServiceRoleClient, getSupabaseConfigStatus } from "@/lib/supabase/server";
import { requireAdminRequest } from "@/server/admin-auth";

export const dynamic = "force-dynamic";

type ProfileCashBody = {
  target?: "self";
  userId?: string;
  username?: string;
  cashBalance?: number;
};

const MAX_CASH_BALANCE = 1_000_000_000;

export async function POST(request: Request) {
  const auth = await requireAdminRequest(request, { allowMarketSecret: false });

  if (!auth.ok) {
    return auth.response;
  }

  const config = getSupabaseConfigStatus();

  if (!config.readyForAdminWrites) {
    return NextResponse.json(
      {
        ok: false,
        error: "Supabase admin credentials are not fully configured.",
        config
      },
      { status: 400 }
    );
  }

  const body = await parseBody(request);
  const cashBalance = normalizeCash(body.cashBalance);

  if (cashBalance === null) {
    return NextResponse.json(
      {
        ok: false,
        error: "Enter a valid cash balance from 0 to 1,000,000,000."
      },
      { status: 400 }
    );
  }

  const supabase = createServiceRoleClient();
  let targetUserId: string | null = null;

  try {
    targetUserId = await resolveTargetUserId({
      supabase,
      body,
      selfUserId: auth.user?.id
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Could not look up profile."
      },
      { status: 500 }
    );
  }

  if (!targetUserId) {
    return NextResponse.json(
      {
        ok: false,
        error: "Could not find the target profile."
      },
      { status: 404 }
    );
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({ cash_balance: cashBalance })
    .eq("id", targetUserId)
    .select("id,username,cash_balance")
    .single();

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        error: `Could not update cash balance: ${error.message}`
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    profile: {
      id: data.id,
      username: data.username,
      cashBalance: Number(data.cash_balance)
    }
  });
}

async function parseBody(request: Request): Promise<ProfileCashBody> {
  try {
    return (await request.json()) as ProfileCashBody;
  } catch {
    return {};
  }
}

function normalizeCash(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  if (value < 0 || value > MAX_CASH_BALANCE) {
    return null;
  }

  return Math.round(value * 100) / 100;
}

async function resolveTargetUserId({
  supabase,
  body,
  selfUserId
}: {
  supabase: ReturnType<typeof createServiceRoleClient>;
  body: ProfileCashBody;
  selfUserId?: string;
}) {
  if (body.target === "self") {
    return selfUserId ?? null;
  }

  if (typeof body.userId === "string" && /^[0-9a-f-]{20,}$/i.test(body.userId.trim())) {
    return body.userId.trim();
  }

  if (typeof body.username === "string" && body.username.trim()) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", body.username.trim())
      .maybeSingle();

    if (error) {
      throw new Error(`Could not look up profile: ${error.message}`);
    }

    return data?.id ?? null;
  }

  return null;
}
