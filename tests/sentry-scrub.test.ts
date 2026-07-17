import type { ErrorEvent } from "@sentry/nextjs";
import { describe, expect, it } from "vitest";
import { scrubSentryEvent } from "@/lib/sentry-scrub";

describe("Sentry privacy scrubber", () => {
  it("removes account and request data before transmission", () => {
    const event = {
      user: { id: "private-user", email: "person@example.com" },
      request: {
        url: "https://rap-market-index.vercel.app/account?token=private#secret",
        cookies: { session: "private" },
        data: { password: "private" },
        env: { SECRET: "private" },
        headers: { authorization: "Bearer private" },
        query_string: "token=private"
      }
    } as unknown as ErrorEvent;

    const scrubbed = scrubSentryEvent(event);

    expect(scrubbed.user).toBeUndefined();
    expect(scrubbed.request).toEqual({
      url: "https://rap-market-index.vercel.app/account"
    });
  });

  it("drops sensitive breadcrumb fields and URL query values", () => {
    const event = {
      breadcrumbs: [
        {
          message: "https://rap-market-index.vercel.app/settings?email=person%40example.com",
          data: {
            route: "/settings",
            email: "person@example.com",
            authToken: "private",
            count: 2
          }
        }
      ]
    } as unknown as ErrorEvent;

    const scrubbed = scrubSentryEvent(event);

    expect(scrubbed.breadcrumbs?.[0]).toMatchObject({
      message: "https://rap-market-index.vercel.app/settings",
      data: {
        route: "/settings",
        count: 2
      }
    });
    expect(scrubbed.breadcrumbs?.[0].data).not.toHaveProperty("email");
    expect(scrubbed.breadcrumbs?.[0].data).not.toHaveProperty("authToken");
  });

  it("redacts identifiers and credentials from exception text", () => {
    const event = {
      message: "Account person@example.com failed for 8a3f6f52-ec61-4bbf-9a9d-94286a4fb7cd",
      exception: {
        values: [
          {
            value: "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJwcml2YXRlIn0.signature"
          }
        ]
      },
      extra: {
        requestBody: "must never be sent"
      }
    } as unknown as ErrorEvent;

    const scrubbed = scrubSentryEvent(event);

    expect(scrubbed.message).toBe("Account [redacted-email] failed for [redacted-id]");
    expect(scrubbed.exception?.values?.[0]?.value).toBe("Bearer [redacted]");
    expect(scrubbed.extra).toBeUndefined();
  });
});
