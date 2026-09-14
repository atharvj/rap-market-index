import { describe, expect, it } from "vitest";
import { isVideoDiscoveryDue, shouldCollectWikimediaSource } from "@/server/market/source-refresh-policy";

describe("market source refresh policy", () => {
  it("collects daily Wikimedia attention during scheduled source runs", () => {
    expect(shouldCollectWikimediaSource("wikimedia", false)).toBe(true);
    expect(shouldCollectWikimediaSource("core", false)).toBe(true);
    expect(shouldCollectWikimediaSource("blended", false)).toBe(true);
  });

  it("does not spend Wikimedia requests during intraday refreshes", () => {
    expect(shouldCollectWikimediaSource("wikimedia", true)).toBe(false);
    expect(shouldCollectWikimediaSource("core", true)).toBe(false);
  });
});
it("discovers new official/editorial videos hourly without repeating every quote refresh", () => {
  const now = Date.parse("2026-09-14T12:00:00Z");
  expect(isVideoDiscoveryDue(undefined, now)).toBe(true);
  expect(isVideoDiscoveryDue("invalid", now)).toBe(true);
  expect(isVideoDiscoveryDue("2026-09-14T11:00:00Z", now)).toBe(true);
  expect(isVideoDiscoveryDue("2026-09-14T11:45:00Z", now)).toBe(false);
});
