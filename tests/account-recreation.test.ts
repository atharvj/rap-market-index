import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  getAccountIdentifierHash,
  getActiveAccountRecreationCooldown
} from "@/server/account-recreation";

const originalServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

describe("account recreation protection", () => {
  beforeEach(() => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "unit-test-service-role-key";
  });

  afterEach(() => {
    if (originalServiceRoleKey === undefined) {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    } else {
      process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRoleKey;
    }
  });

  it("normalizes email addresses before creating the keyed fingerprint", () => {
    expect(getAccountIdentifierHash("  Trader@Example.COM ")).toBe(
      getAccountIdentifierHash("trader@example.com")
    );
    expect(getAccountIdentifierHash("trader@example.com")).not.toContain("trader@example.com");
  });

  it("returns only a cooldown that has not expired", async () => {
    const activeClient = buildCooldownClient("2026-08-20T00:00:00.000Z");
    const expiredClient = buildCooldownClient("2026-07-01T00:00:00.000Z");

    await expect(getActiveAccountRecreationCooldown({
      supabase: activeClient,
      email: "trader@example.com",
      now: new Date("2026-07-21T00:00:00.000Z")
    })).resolves.toEqual({ cooldownUntil: "2026-08-20T00:00:00.000Z" });

    await expect(getActiveAccountRecreationCooldown({
      supabase: expiredClient,
      email: "trader@example.com",
      now: new Date("2026-07-21T00:00:00.000Z")
    })).resolves.toBeNull();
  });
});

function buildCooldownClient(cooldownUntil: string) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.contains = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(async () => ({
    data: {
      details: { cooldownUntil },
      created_at: "2026-07-21T00:00:00.000Z"
    },
    error: null
  }));

  return {
    from: vi.fn(() => chain)
  } as never;
}
