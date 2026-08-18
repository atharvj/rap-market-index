import { describe, expect, it } from "vitest";
import { getMarketNewsTags, marketNewsHasTag, normalizeMarketNewsTag } from "@/lib/market-news-tags";

describe("market news tags", () => {
  it("keeps the primary classification and adds relevant context tags", () => {
    expect(getMarketNewsTags({
      eventType: "controversy",
      title: "Artist faces backlash after incident during arena tour performance"
    })).toEqual(["Controversy", "Tour"]);
  });

  it("preserves a more specific editorial label alongside the primary category", () => {
    expect(getMarketNewsTags({
      eventType: "news",
      eventLabel: "Interview",
      title: "Artist interview covers upcoming album release"
    })).toEqual(["Interview", "News", "Release"]);
  });

  it("lets filters match secondary story context", () => {
    expect(marketNewsHasTag({
      eventType: "controversy",
      title: "Lawsuit disrupts the artist's tour"
    }, "tour")).toBe(true);
  });

  it("rejects unknown filter values", () => {
    expect(normalizeMarketNewsTag("gossip")).toBeNull();
  });
});
