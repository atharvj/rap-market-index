import { NextResponse } from "next/server";
import { createAnonServerClient } from "@/lib/supabase/server";

type AdminAuthSource = "admin-email" | "market-secret";

type AdminAuthSuccess = {
  ok: true;
  source: AdminAuthSource;
  user?: {
    id: string;
    email: string;
  };
};

type AdminAuthFailure = {
  ok: false;
  response: NextResponse;
};

type AdminAuthOptions = {
  allowMarketSecret?: boolean;
};

export async function requireAdminRequest(
  request: Request,
  options: AdminAuthOptions = {}
): Promise<AdminAuthSuccess | AdminAuthFailure> {
  const allowMarketSecret = options.allowMarketSecret ?? true;
  const bearerToken = getBearerToken(request);
  const marketSecret = process.env.MARKET_UPDATE_SECRET?.trim();

  if (
    allowMarketSecret &&
    marketSecret &&
    (request.headers.get("x-market-update-secret") === marketSecret || bearerToken === marketSecret)
  ) {
    return {
      ok: true,
      source: "market-secret"
    };
  }

  const adminEmails = getAdminEmails();

  if (!adminEmails.length) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          ok: false,
          error: "Admin access is not configured. Add ADMIN_EMAILS to the server environment."
        },
        { status: 403 }
      )
    };
  }

  if (!bearerToken) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          ok: false,
          error: "Admin sign-in is required."
        },
        { status: 401 }
      )
    };
  }

  try {
    const supabase = createAnonServerClient(`Bearer ${bearerToken}`);
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user?.email || !data.user.email_confirmed_at) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            ok: false,
            error: data.user && !data.user.email_confirmed_at
              ? "Confirm the admin email address before using operator controls."
              : "Admin session could not be verified."
          },
          { status: 401 }
        )
      };
    }

    const email = data.user.email.toLowerCase();

    if (!adminEmails.includes(email)) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            ok: false,
            error: "This account is not authorized for admin access."
          },
          { status: 403 }
        )
      };
    }

    return {
      ok: true,
      source: "admin-email",
      user: {
        id: data.user.id,
        email
      }
    };
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        {
          ok: false,
          error: "Admin session check failed."
        },
        { status: 500 }
      )
    };
  }
}

function getBearerToken(request: Request) {
  const header = request.headers.get("authorization");
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

export function getAdminEmails() {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined) {
  if (!email) {
    return false;
  }

  return getAdminEmails().includes(email.trim().toLowerCase());
}
