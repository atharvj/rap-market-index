import "server-only";
import { createHash, createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceRoleClient, getSupabaseConfigStatus } from "@/lib/supabase/server";

type RateLimitOptions = {
  request: Request;
  identifier: string;
  scope: string;
  limit: number;
  windowSeconds: number;
};

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

type LocalRateLimitEntry = {
  count: number;
  resetAt: number;
};

const globalRateLimitState = globalThis as typeof globalThis & {
  __rmiRateLimits?: Map<string, LocalRateLimitEntry>;
  __rmiRateLimitMigrationWarning?: boolean;
};

const localRateLimits = globalRateLimitState.__rmiRateLimits ?? new Map<string, LocalRateLimitEntry>();
globalRateLimitState.__rmiRateLimits = localRateLimits;

export async function enforceRateLimit(options: RateLimitOptions): Promise<NextResponse | null> {
  const result = await consumeRateLimit(options);

  if (result.allowed) {
    return null;
  }

  const response = NextResponse.json(
    {
      ok: false,
      error: "Too many requests. Wait a moment and try again."
    },
    { status: 429 }
  );

  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Retry-After", String(result.retryAfterSeconds));
  response.headers.set("RateLimit-Limit", String(options.limit));
  response.headers.set("RateLimit-Remaining", "0");
  response.headers.set("RateLimit-Reset", String(result.retryAfterSeconds));
  return response;
}

export function getRequestIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")
    ?.split(",", 1)[0]
    ?.trim();

  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}

async function consumeRateLimit(options: RateLimitOptions): Promise<RateLimitResult> {
  const normalized = normalizeOptions(options);
  const keyHash = hashIdentifier(`${normalized.scope}:${normalized.identifier}`);

  if (getSupabaseConfigStatus().serviceRoleConfigured) {
    try {
      const supabase = createServiceRoleClient();
      const { data, error } = await supabase.rpc("consume_api_rate_limit", {
        p_key_hash: keyHash,
        p_scope: normalized.scope,
        p_limit: normalized.limit,
        p_window_seconds: normalized.windowSeconds
      });

      if (!error && data?.[0]) {
        return {
          allowed: data[0].allowed,
          remaining: data[0].remaining,
          retryAfterSeconds: Math.max(1, data[0].retry_after_seconds)
        };
      }

      if (!globalRateLimitState.__rmiRateLimitMigrationWarning) {
        globalRateLimitState.__rmiRateLimitMigrationWarning = true;
        console.warn("Distributed API rate limiting is unavailable; using an instance-local fallback.");
      }
    } catch {
      // Preserve availability with a bounded local limiter if Supabase is unavailable.
    }
  }

  return consumeLocalRateLimit({
    key: `${normalized.scope}:${keyHash}`,
    limit: normalized.limit,
    windowSeconds: normalized.windowSeconds
  });
}

function consumeLocalRateLimit({ key, limit, windowSeconds }: { key: string; limit: number; windowSeconds: number }) {
  const now = Date.now();
  const existing = localRateLimits.get(key);

  if (!existing || existing.resetAt <= now) {
    localRateLimits.set(key, {
      count: 1,
      resetAt: now + windowSeconds * 1000
    });
    pruneLocalRateLimits(now);
    return {
      allowed: true,
      remaining: Math.max(0, limit - 1),
      retryAfterSeconds: windowSeconds
    };
  }

  existing.count += 1;
  return {
    allowed: existing.count <= limit,
    remaining: Math.max(0, limit - existing.count),
    retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000))
  };
}

function normalizeOptions(options: RateLimitOptions) {
  return {
    ...options,
    identifier: options.identifier.slice(0, 256),
    scope: options.scope.replace(/[^a-z0-9:_-]/gi, "-").slice(0, 64),
    limit: Math.max(1, Math.min(10_000, Math.floor(options.limit))),
    windowSeconds: Math.max(1, Math.min(86_400, Math.floor(options.windowSeconds)))
  };
}

function hashIdentifier(identifier: string) {
  const secret = process.env.RATE_LIMIT_SECRET?.trim() || process.env.MARKET_UPDATE_SECRET?.trim();

  if (secret) {
    return createHmac("sha256", secret).update(identifier).digest("hex");
  }

  return createHash("sha256").update(identifier).digest("hex");
}

function pruneLocalRateLimits(now: number) {
  if (localRateLimits.size < 5_000) {
    return;
  }

  for (const [key, entry] of localRateLimits) {
    if (entry.resetAt <= now || localRateLimits.size > 7_500) {
      localRateLimits.delete(key);
    }
  }
}
