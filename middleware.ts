import { NextRequest, NextResponse } from "next/server";

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const DEFAULT_MAX_BODY_BYTES = 512 * 1024;
const AVATAR_MAX_BODY_BYTES = 3_300_000;

export function middleware(request: NextRequest) {
  const requestId = request.headers.get("x-request-id")?.slice(0, 128) || crypto.randomUUID();

  if (MUTATION_METHODS.has(request.method)) {
    const fetchSite = request.headers.get("sec-fetch-site");

    if (fetchSite === "cross-site" || !isAllowedOrigin(request)) {
      return jsonError("Cross-site requests are not allowed.", 403, requestId);
    }

    const contentLength = Number(request.headers.get("content-length") ?? 0);
    const maxBodyBytes = request.nextUrl.pathname === "/api/profile/avatar"
      ? AVATAR_MAX_BODY_BYTES
      : DEFAULT_MAX_BODY_BYTES;

    if (Number.isFinite(contentLength) && contentLength > maxBodyBytes) {
      return jsonError("Request body is too large.", 413, requestId);
    }
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders
    }
  });

  response.headers.set("x-request-id", requestId);

  if (MUTATION_METHODS.has(request.method)) {
    response.headers.set("Cache-Control", "no-store");
  }

  return response;
}

function isAllowedOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");

  // Cron jobs and server-to-server calls do not send a browser Origin header.
  if (!origin) {
    return true;
  }

  if (origin === "null") {
    return false;
  }

  const allowedOrigins = new Set([request.nextUrl.origin]);

  addConfiguredOrigin(allowedOrigins, process.env.NEXT_PUBLIC_SITE_URL);
  addConfiguredOrigin(allowedOrigins, process.env.VERCEL_PROJECT_PRODUCTION_URL);
  addConfiguredOrigin(allowedOrigins, process.env.VERCEL_URL);

  return allowedOrigins.has(origin);
}

function addConfiguredOrigin(origins: Set<string>, value: string | undefined) {
  if (!value) {
    return;
  }

  try {
    const normalized = value.startsWith("http://") || value.startsWith("https://")
      ? value
      : `https://${value}`;
    origins.add(new URL(normalized).origin);
  } catch {
    // Ignore malformed optional environment values rather than weakening checks.
  }
}

function jsonError(error: string, status: number, requestId: string) {
  const response = NextResponse.json(
    {
      ok: false,
      error,
      requestId
    },
    { status }
  );
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("x-request-id", requestId);
  return response;
}

export const config = {
  matcher: "/api/:path*"
};
