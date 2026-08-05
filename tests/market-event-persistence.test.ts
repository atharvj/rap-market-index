import { describe, expect, it } from "vitest";
import { dedupeEventsForPersistence } from "@/server/market/supabase-repository";
import type { MarketEvent } from "@/server/market/market-data";

describe("market event source deduplication", () => {
  it("keeps one story when a feed changes its date and title suffix", () => {
    const events = dedupeEventsForPersistence([
      event({
        eventDate: "2026-07-30",
        title: "Baby Keem Announces Ca$ino - Billboard",
        confidence: 0.8
      }),
      event({
        eventDate: "2026-02-10",
        title: "Baby Keem Announces Ca$ino - ca.billboard.com",
        confidence: 0.9
      })
    ]);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventDate: "2026-02-10",
      title: "Baby Keem Announces Ca$ino - ca.billboard.com"
    });
  });

  it("normalizes tracking parameters before comparing publisher URLs", () => {
    const events = dedupeEventsForPersistence([
      event({ sourceUrl: "https://example.com/story?utm_source=google" }),
      event({ sourceUrl: "https://example.com/story" })
    ]);

    expect(events).toHaveLength(1);
    expect(events[0]?.sourceUrl).toBe("https://example.com/story");
  });
});

function event(overrides: Partial<MarketEvent> = {}): MarketEvent {
  return {
    artistId: "baby-keem",
    eventDate: "2026-07-30",
    eventType: "release",
    title: "Baby Keem Announces Ca$ino",
    sourceName: "Billboard",
    sourceUrl: "https://www.billboard.com/story",
    sentimentScore: 40,
    impactScore: 52,
    confidence: 0.8,
    rawPayload: { source: "media_rss_item" },
    ...overrides
  };
}
