import { describe, expect, it } from "vitest";
import { isObfuscatedExistingSignup } from "@/lib/auth-signup";

describe("duplicate signup responses", () => {
  it("detects Supabase's empty-identity response for an existing account", () => {
    expect(isObfuscatedExistingSignup({ identities: [] })).toBe(true);
  });

  it("does not reject a newly created identity", () => {
    expect(isObfuscatedExistingSignup({ identities: [{ id: "identity" }] })).toBe(false);
    expect(isObfuscatedExistingSignup(null)).toBe(false);
  });
});
