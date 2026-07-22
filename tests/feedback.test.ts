import { describe, expect, it } from "vitest";
import {
  hasFilledFeedbackHoneypot,
  validateFeedbackSubmission
} from "@/lib/feedback";
import { enforceRateLimit } from "@/server/rate-limit";

describe("feedback validation", () => {
  it("accepts a supported category, trimmed message, and optional email", () => {
    const result = validateFeedbackSubmission({
      category: "data",
      message: "  This artist quote appears to use the wrong source.  ",
      contactEmail: " Trader@Example.com "
    });

    expect(result).toEqual({
      ok: true,
      value: {
        category: "data",
        message: "This artist quote appears to use the wrong source.",
        contactEmail: "trader@example.com"
      }
    });
  });

  it("rejects unsupported categories, short messages, and invalid emails", () => {
    expect(validateFeedbackSubmission({ category: "spam", message: "A valid feedback message" }).ok).toBe(false);
    expect(validateFeedbackSubmission({ category: "bug", message: "Too short" }).ok).toBe(false);
    expect(validateFeedbackSubmission({
      category: "bug",
      message: "A valid feedback message",
      contactEmail: "not-an-email"
    }).ok).toBe(false);
  });

  it("detects the hidden website honeypot", () => {
    expect(hasFilledFeedbackHoneypot({ website: "https://spam.example" })).toBe(true);
    expect(hasFilledFeedbackHoneypot({ website: " " })).toBe(false);
  });
});

describe("feedback rate limiting", () => {
  it("allows five submissions per IP per hour and rejects the sixth", async () => {
    const identifier = `feedback-test-${Date.now()}-${Math.random()}`;
    const request = new Request("https://rmi.test/api/feedback");
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    try {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        expect(await enforceRateLimit({
          request,
          identifier,
          scope: "feedback-submit-test",
          limit: 5,
          windowSeconds: 3600
        })).toBeNull();
      }

      const limited = await enforceRateLimit({
        request,
        identifier,
        scope: "feedback-submit-test",
        limit: 5,
        windowSeconds: 3600
      });

      expect(limited?.status).toBe(429);
      expect(limited?.headers.get("Retry-After")).toBeTruthy();
    } finally {
      if (serviceRoleKey !== undefined) {
        process.env.SUPABASE_SERVICE_ROLE_KEY = serviceRoleKey;
      }
    }
  });
});
