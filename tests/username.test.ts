import { describe, expect, it } from "vitest";
import {
  getUsernameValidationError,
  normalizeUsernameInput,
  normalizeUsernameKey
} from "@/lib/username";

describe("username rules", () => {
  it("allows internal spaces and normalizes repeated whitespace", () => {
    expect(normalizeUsernameInput("  lil   o  ")).toBe("lil o");
    expect(getUsernameValidationError("lil o")).toBeNull();
  });

  it("keeps username comparisons case-insensitive", () => {
    expect(normalizeUsernameKey(" Lil O ")).toBe(normalizeUsernameKey("lil o"));
  });

  it("rejects unsupported characters and leading separators created by spaces", () => {
    expect(getUsernameValidationError("lil@o")).toContain("Use 2-32 characters");
    expect(getUsernameValidationError("lil o ")).toBeNull();
  });
});
