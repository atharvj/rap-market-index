import { describe, expect, it } from "vitest";
import { shouldCollectWikimediaSource } from "@/server/market/source-refresh-policy";

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
