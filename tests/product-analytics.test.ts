import { describe, expect, it } from "vitest";
import { normalizeAnalyticsPath, validateProductAnalyticsEvent } from "@/lib/product-analytics";

const baseEvent = {
  visitorId: "visitor_12345678",
  sessionId: "session_12345678"
};

describe("product analytics validation", () => {
  it("accepts the bounded public funnel events", () => {
    expect(validateProductAnalyticsEvent({
      ...baseEvent,
      eventName: "artist_view",
      path: "/artists/young-thug?utm_source=reddit",
      artistId: "young-thug",
      campaignSource: "r/PlayMyGame",
      campaignMedium: "Reddit",
      campaignName: "Public Beta"
    })).toEqual({
      ok: true,
      value: {
        eventName: "artist_view",
        visitorId: baseEvent.visitorId,
        sessionId: baseEvent.sessionId,
        path: "/artists/young-thug",
        artistId: "young-thug",
        authMethod: null,
        campaignSource: "r-playmygame",
        campaignMedium: "reddit",
        campaignName: "public-beta",
        referrerHost: null
      }
    });
  });

  it("does not let the public endpoint forge server milestones", () => {
    const result = validateProductAnalyticsEvent({
      ...baseEvent,
      eventName: "signup_completed"
    });

    expect(result.ok).toBe(false);
  });

  it("requires the dimensions used by artist and signup events", () => {
    expect(validateProductAnalyticsEvent({
      ...baseEvent,
      eventName: "artist_view",
      path: "/artists/unknown"
    }).ok).toBe(false);
    expect(validateProductAnalyticsEvent({
      ...baseEvent,
      eventName: "signup_started",
      path: "/account"
    }).ok).toBe(false);
  });

  it("stores paths without query strings or fragments", () => {
    expect(normalizeAnalyticsPath("/news?utm_source=reddit#story")).toBe("/news");
    expect(normalizeAnalyticsPath("https://example.com/news")).toBeNull();
    expect(normalizeAnalyticsPath("not-a-path")).toBeNull();
    expect(normalizeAnalyticsPath("//external.example/phishing")).toBeNull();
    expect(normalizeAnalyticsPath("/users/123-private-profile-id")).toBe("/users/profile");
    expect(normalizeAnalyticsPath("/account/private@example.com")).toBeNull();
  });
});
