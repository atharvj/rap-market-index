import { describe, expect, it } from "vitest";
import { buildEventMarketSignals } from "@/server/market/event-signals";
import type { MarketUpdateArtist } from "@/server/market/daily-update";
import type { MarketEvent } from "@/server/market/market-data";

const artist: MarketUpdateArtist = {
  id: "young-thug",
  name: "Young Thug",
  ticker: "THUG",
  currentPrice: 80,
  previousClose: 80,
  hypeScore: 55,
  volatility: 1,
  category: "superstar",
  stats: {
    streamingGrowth: 0,
    youtubeGrowth: 0,
    searchGrowth: 0,
    socialGrowth: 0,
    newsScore: 50,
    traderDemand: 0
  }
};

function featureEvent(rawPayload: Record<string, unknown>): MarketEvent {
  return {
    artistId: artist.id,
    eventDate: "2026-07-10",
    eventType: "viral",
    title: "Diamond surprise mixtape featuring Young Thug",
    sourceName: "Music publication",
    sourceUrl: "https://example.com/story",
    sentimentScore: 65,
    impactScore: 70,
    confidence: 0.9,
    rawPayload: {
      source: "ai_research_event",
      sourceTier: 3,
      evidenceLevel: "confirmed",
      sourceType: "music_publication",
      reachScope: "broad",
      marketConnection: "direct_music",
      artistRole: "featured",
      factualClaimConfirmed: true,
      corroboratingSourceCount: 2,
      ...rawPayload
    }
  };
}

function evidenceMultiplier(event: MarketEvent) {
  const signal = buildEventMarketSignals({
    artists: [artist],
    runDate: "2026-07-11",
    eventsByArtist: { [artist.id]: [event] }
  })[artist.id];
  const events = signal.rawPayload.events as Array<{ evidenceSafetyMultiplier: number }>;

  return events[0].evidenceSafetyMultiplier;
}

describe("feature evidence safeguards", () => {
  it("nearly removes a credited feature with no demonstrated demand", () => {
    expect(evidenceMultiplier(featureEvent({}))).toBeLessThanOrEqual(0.14);
  });

  it("restores weight only when independent music demand is confirmed", () => {
    const withoutDemand = evidenceMultiplier(featureEvent({}));
    const withDemand = evidenceMultiplier(featureEvent({ musicDemandConfirmed: true }));

    expect(withDemand).toBeGreaterThan(withoutDemand);
    expect(withDemand).toBeLessThan(1);
  });

  it("allows full weight when demand and corroborated public reaction agree", () => {
    expect(evidenceMultiplier(featureEvent({
      musicDemandConfirmed: true,
      publicReactionConfirmed: true,
      fanReactionEvidenceCount: 2
    }))).toBe(1);
  });
});

describe("music relevance safeguards", () => {
  it("removes celebrity attention with no demonstrated music demand", () => {
    const event = featureEvent({
      marketConnection: "attention_only",
      musicDemandConfirmed: false
    });
    event.eventType = "news";
    event.title = "Young Thug launches a new fragrance collection";

    expect(evidenceMultiplier(event)).toBe(0);
  });

  it("heavily discounts adjacent attention even when downstream demand is confirmed", () => {
    const event = featureEvent({
      marketConnection: "attention_only",
      musicDemandConfirmed: true
    });
    event.eventType = "news";
    event.title = "Young Thug challenge coincides with verified streaming demand";

    expect(evidenceMultiplier(event)).toBe(0.28);
  });
});

describe("release demand safeguards", () => {
  function releaseEvent(rawPayload: Record<string, unknown> = {}): MarketEvent {
    return {
      artistId: artist.id,
      eventDate: "2026-07-10",
      eventType: "release",
      title: "Young Thug releases a new album, out now",
      sourceName: "Music publication",
      sourceUrl: "https://example.com/release",
      sentimentScore: 65,
      impactScore: 75,
      confidence: 0.9,
      rawPayload: {
        source: "manual_event",
        releaseKind: "album",
        ...rawPayload
      }
    };
  }

  it("treats a release as a baseline catalyst until demand is demonstrated", () => {
    expect(evidenceMultiplier(releaseEvent())).toBeLessThan(1);
  });

  it("restores release authority when independent music demand is confirmed", () => {
    expect(evidenceMultiplier(releaseEvent({ musicDemandConfirmed: true }))).toBe(1);
  });
});

describe("event story deduplication", () => {
  it("counts same-day coverage of one release only once", () => {
    const shared: Omit<MarketEvent, "title" | "sourceUrl"> = {
      artistId: artist.id,
      eventDate: "2026-07-10",
      eventType: "release",
      sourceName: "Music publication",
      sentimentScore: 35,
      impactScore: 45,
      confidence: 0.8,
      rawPayload: { sourceTier: 2 }
    };
    const signal = buildEventMarketSignals({
      artists: [artist],
      runDate: "2026-07-11",
      eventsByArtist: {
        [artist.id]: [
          { ...shared, title: "Young Thug Shares New Song 'Example'", sourceUrl: "https://one.test/example" },
          { ...shared, title: "Young Thug - Example (Official Music Video)", sourceUrl: "https://two.test/example" }
        ]
      }
    })[artist.id];
    const events = signal.rawPayload.events as unknown[];

    expect(events).toHaveLength(1);
  });
});

describe("project announcement classification", () => {
  function projectSignal(title: string) {
    const event: MarketEvent = {
      artistId: artist.id,
      eventDate: "2026-07-10",
      eventType: "release",
      title,
      sourceName: "Music publication",
      sourceUrl: "https://example.com/project",
      sentimentScore: 65,
      impactScore: 75,
      confidence: 0.9,
      rawPayload: {
        source: "manual_event",
        releaseKind: "album"
      }
    };

    return buildEventMarketSignals({
      artists: [artist],
      runDate: "2026-07-10",
      eventsByArtist: { [artist.id]: [event] }
    })[artist.id];
  }

  it("does not describe an album teaser as a completed project release", () => {
    const signal = projectSignal("Young Thug teases an upcoming new album");
    const events = signal.rawPayload.events as Array<{ eventSubtype: string }>;

    expect(events[0].eventSubtype).toBe("project_announcement");
    expect(signal.modifiers?.[0]?.reason).toContain("project announcement");
  });

  it("gives a confirmed project release more authority than an announcement", () => {
    const announcement = projectSignal("Young Thug announces an upcoming new album");
    const release = projectSignal("Young Thug releases a new album, out now");
    const announcementShock = Math.abs(announcement.modifiers?.[0]?.priceShock ?? 0);
    const releaseShock = Math.abs(release.modifiers?.[0]?.priceShock ?? 0);

    expect(releaseShock).toBeGreaterThan(announcementShock);
  });
});
