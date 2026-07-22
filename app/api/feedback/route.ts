import { NextResponse } from "next/server";
import {
  ANONYMOUS_FEEDBACK_RATE_LIMIT,
  FEEDBACK_IP_RATE_LIMIT,
  FEEDBACK_RATE_WINDOW_SECONDS,
  hasFilledFeedbackHoneypot,
  SIGNED_IN_FEEDBACK_RATE_LIMIT,
  validateFeedbackSubmission
} from "@/lib/feedback";
import { createServiceRoleClient, getSupabaseConfigStatus } from "@/lib/supabase/server";
import { reportServerError } from "@/server/observability";
import { enforceRateLimit, getRequestIp } from "@/server/rate-limit";
import { requireConfirmedUser } from "@/server/user-auth";

export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store, max-age=0" };

export async function POST(request: Request) {
  const config = getSupabaseConfigStatus();

  if (!config.urlConfigured || !config.serviceRoleConfigured) {
    return NextResponse.json(
      { ok: false, error: "Feedback is temporarily unavailable." },
      { status: 503, headers: PRIVATE_HEADERS }
    );
  }

  const limited = await enforceRateLimit({
    request,
    identifier: getRequestIp(request),
    scope: "feedback-submit-ip",
    limit: FEEDBACK_IP_RATE_LIMIT,
    windowSeconds: FEEDBACK_RATE_WINDOW_SECONDS
  });

  if (limited) {
    return limited;
  }

  let userId: string | null = null;

  if (request.headers.has("authorization")) {
    const auth = await requireConfirmedUser(request);

    if (!auth.ok) {
      return auth.response;
    }

    userId = auth.user.id;
  }

  const audienceLimited = await enforceRateLimit({
    request,
    identifier: userId ?? getRequestIp(request),
    scope: userId ? "feedback-submit-user" : "feedback-submit-anonymous",
    limit: userId ? SIGNED_IN_FEEDBACK_RATE_LIMIT : ANONYMOUS_FEEDBACK_RATE_LIMIT,
    windowSeconds: FEEDBACK_RATE_WINDOW_SECONDS
  });

  if (audienceLimited) {
    return audienceLimited;
  }

  const body = await parseBody(request);

  if (hasFilledFeedbackHoneypot(body)) {
    return NextResponse.json({ ok: true }, { status: 202, headers: PRIVATE_HEADERS });
  }

  const validation = validateFeedbackSubmission(body);

  if (!validation.ok) {
    return NextResponse.json(
      { ok: false, error: validation.error },
      { status: 400, headers: PRIVATE_HEADERS }
    );
  }

  try {
    const { error } = await createServiceRoleClient().from("user_feedback").insert({
      user_id: userId,
      category: validation.value.category,
      message: validation.value.message,
      contact_email: validation.value.contactEmail
    });

    if (error) {
      throw error;
    }

    return NextResponse.json({ ok: true }, { status: 201, headers: PRIVATE_HEADERS });
  } catch (error) {
    reportServerError(error, "feedback.submit");
    const message = getErrorMessage(error);
    const migrationPending = /user_feedback|schema cache|relation .* does not exist/i.test(message);

    return NextResponse.json(
      {
        ok: false,
        error: migrationPending
          ? "Feedback storage needs setup. Run Supabase migration 028_user_feedback.sql."
          : "Could not send feedback. Try again shortly."
      },
      { status: 500, headers: PRIVATE_HEADERS }
    );
  }
}

async function parseBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }

  return "";
}
