import { describe, expect, it } from "vitest";
import { classifyArticleEvent } from "@/server/market/gdelt-source";
import { isHistoricalRetrospective } from "@/server/market/article-timeliness";
import { isStoredMarketEventSourceIntegrityValid } from "@/server/market/event-integrity";
describe("article timing", () => {
  it.each([
    "September 11 In Hip-Hop History: JAY-Z Releases ‘The Blueprint’ Album",
    "September 11 In Hip-Hop History: 50 Cent & Ye Drop Albums On The Same Day",
    "On This Day: Artist Released His Debut Album",
    "Artist's Classic Album Turns 25",
    "Celebrating the anniversary of Artist's classic debut album",
    "Looking Back at Artist's Tour 20 Years Ago"
  ])("does not turn a newly published retrospective into a current catalyst: %s", title => {
    expect(classifyArticleEvent(title, "iheart.com")).toBeNull();
    expect(isStoredMarketEventSourceIntegrityValid({ source: "media_rss_item" }, { title, eventDate: "2026-09-14" })).toBe(false);
  });
  it.each([
    "Artist announces 25th anniversary tour",
    "Artist releases expanded anniversary edition of classic album",
    "Artist makes music history with chart-topping new album"
  ])("keeps actual current developments eligible: %s", title => expect(isHistoricalRetrospective(title)).toBe(false));
  it("recognizes an actual onstage reunion even when the headline mentions an old beef", () => {
    expect(classifyArticleEvent("Ye & Big Sean Squash Beef & Reunite at Chicago Show With Performance", "billboard.com")?.reason).toBe("performance_terms");
    expect(classifyArticleEvent("Artist explains why he wants to squash beef and reunite", "billboard.com")?.impactScore).not.toBeGreaterThan(0);
  });
});
