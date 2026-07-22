import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  getAccountIdentifierHash,
  getActiveAccountRecreationCooldown,
  isAccountRecreationCooldownExempt,
  ACCOUNT_RECREATION_COOLDOWN_DAYS
} from "@/server/account-recreation";

const originalServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const originalExemptEmails = process.env.ACCOUNT_RECREATION_COOLDOWN_EXEMPT_EMAILS;

describe("account recreation protection", () => {
  beforeEach(() => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "unit-test-service-role-key";
    delete process.env.ACCOUNT_RECREATION_COOLDOWN_EXEMPT_EMAILS;
  });

  afterEach(() => {
    if (originalServiceRoleKey === undefined) {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    } else {
      process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRoleKey;
    }

    if (originalExemptEmails === undefined) {
      delete process.env.ACCOUNT_RECREATION_COOLDOWN_EXEMPT_EMAILS;
    } else {
      process.env.ACCOUNT_RECREATION_COOLDOWN_EXEMPT_EMAILS = originalExemptEmails;
    }
  });

  it("uses a seven-day cooldown", () => {
    expect(ACCOUNT_RECREATION_COOLDOWN_DAYS).toBe(7);
  });

  it("supports private, normalized test-account exemptions", () => {
    process.env.ACCOUNT_RECREATION_COOLDOWN_EXEMPT_EMAILS = " first@example.com,Test@Example.COM ";

    expect(isAccountRecreationCooldownExempt(" test@example.com ")).toBe(true);
    expect(isAccountRecreationCooldownExempt("trader@example.com")).toBe(false);
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
