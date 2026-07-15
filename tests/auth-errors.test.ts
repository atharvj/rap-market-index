import { describe, expect, it } from "vitest";
import { formatAuthErrorMessage } from "@/lib/auth-errors";

describe("authentication error messages", () => {
  it("turns provider rate-limit errors into actionable guidance", () => {
    expect(formatAuthErrorMessage("email rate limit exceeded")).toContain("one hour");
  });

  it("does not expose an exact duplicate-account result", () => {
    expect(formatAuthErrorMessage("User already registered")).toBe(
      "An account may already exist for this email. Try logging in or resetting your password."
    );
  });

  it("preserves unrelated provider errors", () => {
    expect(formatAuthErrorMessage("Invalid login credentials")).toBe("Invalid login credentials");
  });
});
