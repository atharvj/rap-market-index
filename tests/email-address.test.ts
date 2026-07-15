import { describe, expect, it } from "vitest";
import {
  getEmailDomain,
  getEmailDomainSuggestion,
  getEmailDomainWarning,
  isDisposableEmailAddress
} from "@/lib/email-address";

describe("email domain typo detection", () => {
  it("catches common Gmail transpositions before signup", () => {
    expect(getEmailDomainSuggestion("trader@gmial.com")).toBe("trader@gmail.com");
    expect(getEmailDomainSuggestion("trader@gmali.com")).toBe("trader@gmail.com");
  });

  it("does not claim that an ordinary domain is invalid", () => {
    expect(getEmailDomainSuggestion("artist@example.com")).toBeNull();
    expect(getEmailDomainWarning("artist@example.com")).toBeNull();
  });

  it("blocks disposable email providers and their subdomains", () => {
    expect(getEmailDomain("Trader@MAILdrop.cc")).toBe("maildrop.cc");
    expect(isDisposableEmailAddress("trader@maildrop.cc")).toBe(true);
    expect(isDisposableEmailAddress("trader@inbox.maildrop.cc")).toBe(true);
    expect(getEmailDomainWarning("trader@maildrop.cc")).toBe(
      "Use a permanent email address. Temporary email services are not allowed."
    );
  });

  it("allows established permanent email providers", () => {
    expect(isDisposableEmailAddress("trader@gmail.com")).toBe(false);
    expect(isDisposableEmailAddress("trader@proton.me")).toBe(false);
  });
});
