import { NextResponse } from "next/server";
import { getEmailDomainWarning } from "@/lib/email-address";
import type { Json } from "@/lib/supabase/database.types";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { isAdminEmail, requireAdminRequest } from "@/server/admin-auth";
import { reportServerError } from "@/server/observability";
import type { User } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0" };

type SupportAction = "suspend" | "restore" | "reset_portfolio" | "delete_unconfirmed" | "delete_account";

export async function GET(request: Request) {
  const auth = await requireAdminRequest(request, { allowMarketSecret: false });

  if (!auth.ok) {
    return auth.response;
  }

  try {
    const supabase = createServiceRoleClient();
    const authUsers = await listSupportUsers(supabase);
    const userIds = authUsers.map((user) => user.id);
    const [profilesResult, leaderboardResult, holdingsResult, shortsResult, tradesResult, artistsResult] = await Promise.all([
      userIds.length
        ? supabase.from("profiles").select("id,username,cash_balance,onboarding_completed,is_admin,created_at").in("id", userIds)
        : Promise.resolve({ data: [], error: null }),
      userIds.length
        ? supabase.from("market_leaderboard").select("user_id,portfolio_value,gain_percent").in("user_id", userIds)
        : Promise.resolve({ data: [], error: null }),
      userIds.length
        ? supabase.from("holdings").select("user_id,artist_id").in("user_id", userIds)
        : Promise.resolve({ data: [], error: null }),
      userIds.length
        ? supabase.from("short_positions").select("user_id,artist_id").in("user_id", userIds)
        : Promise.resolve({ data: [], error: null }),
      userIds.length
        ? supabase
            .from("market_trade_events")
            .select("id,user_id,artist_id,type,shares,price,commission,market_eligible,created_at")
            .in("user_id", userIds)
            .order("created_at", { ascending: false })
            .limit(250)
        : Promise.resolve({ data: [], error: null }),
      supabase.from("artists").select("id,name,ticker")
    ]);

    const firstError = [profilesResult, leaderboardResult, holdingsResult, shortsResult, tradesResult, artistsResult]
      .find((result) => result.error)?.error;

    if (firstError) {
      throw new Error(`Could not load account support data: ${firstError.message}`);
    }

    const profiles = new Map((profilesResult.data ?? []).map((profile) => [profile.id, profile]));
    const leaderboard = new Map((leaderboardResult.data ?? []).map((entry) => [entry.user_id, entry]));
    const artists = new Map((artistsResult.data ?? []).map((artist) => [artist.id, artist]));
    const positionCounts = new Map<string, number>();
    const tradeCounts = new Map<string, number>();

    for (const position of [...(holdingsResult.data ?? []), ...(shortsResult.data ?? [])]) {
      positionCounts.set(position.user_id, (positionCounts.get(position.user_id) ?? 0) + 1);
    }

    for (const trade of tradesResult.data ?? []) {
      tradeCounts.set(trade.user_id, (tradeCounts.get(trade.user_id) ?? 0) + 1);
    }

    const users = authUsers.map((user) => {
      const profile = profiles.get(user.id);
      const standing = leaderboard.get(user.id);

      return {
        id: user.id,
        email: user.email ?? null,
        emailDomainWarning: getEmailDomainWarning(user.email),
        username: profile?.username ?? user.email?.split("@")[0] ?? "User",
        createdAt: user.created_at,
        lastSignInAt: user.last_sign_in_at ?? null,
        emailConfirmedAt: user.email_confirmed_at ?? null,
        suspendedUntil: user.banned_until ?? null,
        isSuspended: Boolean(user.banned_until && new Date(user.banned_until).getTime() > Date.now()),
        isAdmin: Boolean(profile?.is_admin || isAdminEmail(user.email)),
        onboardingCompleted: Boolean(profile?.onboarding_completed),
        cashBalance: Number(profile?.cash_balance ?? 0),
        portfolioValue: Number(standing?.portfolio_value ?? profile?.cash_balance ?? 0),
        gainPercent: Number(standing?.gain_percent ?? 0),
        positionCount: positionCounts.get(user.id) ?? 0,
        tradeCount: tradeCounts.get(user.id) ?? 0
      };
    });

    const recentOrders = (tradesResult.data ?? []).slice(0, 40).map((trade) => {
      const profile = profiles.get(trade.user_id);
      const artist = artists.get(trade.artist_id);

      return {
        id: trade.id,
        userId: trade.user_id,
        username: profile?.username ?? "User",
        artistId: trade.artist_id,
        artistName: artist?.name ?? trade.artist_id,
        ticker: artist?.ticker ?? trade.artist_id.toUpperCase(),
        type: trade.type,
        shares: Number(trade.shares),
        price: Number(trade.price),
        commission: Number(trade.commission),
        marketEligible: Boolean(trade.market_eligible),
        createdAt: trade.created_at
      };
    });
    const recentAdminActions = await loadRecentAdminActions(supabase, profiles);

    return NextResponse.json(
      {
        ok: true,
        userCount: users.length,
        users,
        recentOrders,
        recentAdminActions
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    reportServerError(error, "admin.user_support.load");
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not load user support data." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

async function listSupportUsers(supabase: ReturnType<typeof createServiceRoleClient>) {
  const users: User[] = [];
  const perPage = 100;
  const maxPages = 10;

  for (let page = 1; page <= maxPages; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });

    if (error) {
      throw new Error(`Could not load accounts: ${error.message}`);
    }

    users.push(...data.users);

    if (data.users.length < perPage) {
      break;
    }
  }

  return users;
}

async function loadRecentAdminActions(
  supabase: ReturnType<typeof createServiceRoleClient>,
  profiles: Map<string, { id: string; username: string }>
) {
  const { data, error } = await supabase
    .from("admin_action_log")
    .select("id,actor_user_id,target_user_id,action,reason,details,created_at")
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    if (error.message.toLowerCase().includes("admin_action_log")) {
      return [];
    }

    throw new Error(`Could not load the operator audit trail: ${error.message}`);
  }

  return (data ?? []).map((entry) => ({
    id: entry.id,
    actorUserId: entry.actor_user_id,
    actorUsername: entry.actor_user_id ? profiles.get(entry.actor_user_id)?.username ?? "Admin" : "System",
    targetUserId: entry.target_user_id,
    targetUsername: entry.target_user_id ? profiles.get(entry.target_user_id)?.username ?? "Account" : null,
    action: entry.action,
    reason: entry.reason,
    details: entry.details,
    createdAt: entry.created_at
  }));
}

export async function PATCH(request: Request) {
  const auth = await requireAdminRequest(request, { allowMarketSecret: false });

  if (!auth.ok) {
    return auth.response;
  }

  try {
    const body = await request.json() as {
      action?: SupportAction;
      userId?: string;
      reason?: string;
      startingCash?: number;
      confirmationEmail?: string;
    };
    const action = body.action;
    const userId = body.userId?.trim();
    const reason = body.reason?.trim().slice(0, 500) ?? "";

    if (!action || !["suspend", "restore", "reset_portfolio", "delete_unconfirmed", "delete_account"].includes(action) || !userId) {
      return NextResponse.json(
        { ok: false, error: "A valid support action and user are required." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const supabase = createServiceRoleClient();
    const { data: targetResult, error: targetError } = await supabase.auth.admin.getUserById(userId);
    const target = targetResult.user;

    if (targetError || !target) {
      return NextResponse.json(
        { ok: false, error: "Target account was not found." },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    if (
      (action === "suspend" || action === "restore" || action === "delete_unconfirmed" || action === "delete_account") &&
      (userId === auth.user?.id || isAdminEmail(target.email))
    ) {
      return NextResponse.json(
        { ok: false, error: "Protected administrator accounts cannot be changed from this control." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    if (action === "delete_unconfirmed") {
      if (target.email_confirmed_at || target.last_sign_in_at) {
        return NextResponse.json(
          { ok: false, error: "Only an account that has never confirmed its email or signed in can be removed here." },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }

      const { error } = await supabase.auth.admin.deleteUser(userId, false);

      if (error) {
        throw new Error(`Could not remove unconfirmed account: ${error.message}`);
      }

      await recordAdminAction({
        supabase,
        actorUserId: auth.user?.id ?? null,
        targetUserId: null,
        action,
        reason,
        details: {
          deletedUserId: userId,
          email: target.email ?? null
        }
      });

      return NextResponse.json({ ok: true, action, userId }, { headers: NO_STORE_HEADERS });
    }

    if (action === "delete_account") {
      if (!target.banned_until || new Date(target.banned_until).getTime() <= Date.now()) {
        return NextResponse.json(
          { ok: false, error: "Suspend the account before permanently deleting it." },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }

      if (!target.email || body.confirmationEmail?.trim().toLowerCase() !== target.email.toLowerCase()) {
        return NextResponse.json(
          { ok: false, error: "Enter the account email exactly to confirm permanent deletion." },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }

      const deletedEmail = target.email;
      const { error } = await supabase.auth.admin.deleteUser(userId, false);

      if (error) {
        throw new Error(`Could not delete account: ${error.message}`);
      }

      await recordAdminAction({
        supabase,
        actorUserId: auth.user?.id ?? null,
        targetUserId: null,
        action,
        reason,
        details: {
          deletedUserId: userId,
          email: deletedEmail
        }
      });

      return NextResponse.json({ ok: true, action, userId }, { headers: NO_STORE_HEADERS });
    }

    if (action === "suspend" || action === "restore") {
      const { data, error } = await supabase.auth.admin.updateUserById(userId, {
        ban_duration: action === "suspend" ? "876000h" : "none"
      });

      if (error) {
        throw new Error(`Could not ${action} account: ${error.message}`);
      }

      await recordAdminAction({
        supabase,
        actorUserId: auth.user?.id ?? null,
        targetUserId: userId,
        action,
        reason,
        details: { suspendedUntil: data.user.banned_until ?? null }
      });

      return NextResponse.json(
        {
          ok: true,
          action,
          userId,
          suspendedUntil: data.user.banned_until ?? null
        },
        { headers: NO_STORE_HEADERS }
      );
    }

    const startingCash = Number(body.startingCash ?? 100_000);

    if (!Number.isFinite(startingCash) || startingCash < 0 || startingCash > 100_000_000) {
      return NextResponse.json(
        { ok: false, error: "Starting cash must be between $0 and $100,000,000." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const { data, error } = await supabase.rpc("admin_reset_user_portfolio", {
      p_target_user_id: userId,
      p_starting_cash: startingCash,
      p_actor_user_id: auth.user?.id ?? null,
      p_reason: reason
    });

    if (error) {
      const migrationMissing = error.message.toLowerCase().includes("admin_reset_user_portfolio");
      throw new Error(
        migrationMissing
          ? "Portfolio reset storage is not installed. Run migration 023_admin_user_support.sql."
          : `Could not reset portfolio: ${error.message}`
      );
    }

    return NextResponse.json({ ok: true, action, userId, result: data }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    reportServerError(error, "admin.user_support.action");
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "User support action failed." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

async function recordAdminAction({
  supabase,
  actorUserId,
  targetUserId,
  action,
  reason,
  details
}: {
  supabase: ReturnType<typeof createServiceRoleClient>;
  actorUserId: string | null;
  targetUserId: string | null;
  action: string;
  reason: string;
  details: Json;
}) {
  const { error } = await supabase.from("admin_action_log").insert({
    actor_user_id: actorUserId,
    target_user_id: targetUserId,
    action,
    reason,
    details
  });

  if (error && !error.message.toLowerCase().includes("admin_action_log")) {
    throw new Error(`Account changed, but the admin audit log failed: ${error.message}`);
  }
}
