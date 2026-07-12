import { describe, expect, it } from "vitest";
import { getEmailDomainSuggestion, getEmailDomainWarning } from "@/lib/email-address";

describe("email domain typo detection", () => {
  it("catches common Gmail transpositions before signup", () => {
    expect(getEmailDomainSuggestion("trader@gmial.com")).toBe("trader@gmail.com");
    expect(getEmailDomainSuggestion("trader@gmali.com")).toBe("trader@gmail.com");
  });

  it("does not claim that an ordinary domain is invalid", () => {
    expect(getEmailDomainSuggestion("artist@example.com")).toBeNull();
    expect(getEmailDomainWarning("artist@example.com")).toBeNull();
  });
});
