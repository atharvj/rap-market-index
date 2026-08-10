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
      evidenceVersion: 2,
      sourceUrlExactSearchMatch: true,
      publisherArticleVerified: true,
      publisherDateVerified: true,
      publisherHeadlineVerified: true,
      publisherCanonicalUrl: "https://example.com/story",
      publisherPublishedDate: "2026-07-10",
      publisherHeadline: "Diamond surprise mixtape featuring Young Thug",
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
  it("drops a legacy AI event that has no publisher provenance", () => {
    const event = featureEvent({
      publisherArticleVerified: false,
      publisherDateVerified: false,
      publisherHeadlineVerified: false
    });
    const signals = buildEventMarketSignals({
      artists: [artist],
      runDate: "2026-07-11",
      eventsByArtist: { [artist.id]: [event] }
    });

    expect(signals[artist.id]).toBeUndefined();
  });

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
    event.rawPayload.publisherHeadline = event.title;

    expect(evidenceMultiplier(event)).toBe(0);
  });

  it("heavily discounts adjacent attention even when downstream demand is confirmed", () => {
    const event = featureEvent({
      marketConnection: "attention_only",
      musicDemandConfirmed: true
    });
    event.eventType = "news";
    event.title = "Young Thug challenge coincides with verified streaming demand";
    event.rawPayload.publisherHeadline = event.title;

    expect(evidenceMultiplier(event)).toBe(0.28);
  });
});

describe("release demand safeguards", () => {
  function releaseEvent(rawPayload: Record<string, unknown> = {}, eventDate = "2026-07-10"): MarketEvent {
    return {
      artistId: artist.id,
      eventDate,
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

  it("scales release demand by views relative to the artist's expected audience", () => {
    const weakRelease = evidenceMultiplier(releaseEvent({ viewCount: 100_000 }, "2026-07-04"));
    const breakoutRelease = evidenceMultiplier(releaseEvent({
      viewCount: 3_000_000,
      likeCount: 270_000,
      commentCount: 12_000
    }, "2026-07-04"));

    expect(breakoutRelease).toBeGreaterThan(weakRelease);
    expect(breakoutRelease).toBeGreaterThan(1);
  });

  it("judges the same view total against each artist's own audience baseline", () => {
    const undergroundArtist: MarketUpdateArtist = {
      ...artist,
      id: "new-artist",
      name: "New Artist",
      ticker: "NEW",
      category: "underground",
      currentPrice: 12,
      previousClose: 12
    };
    const event = releaseEvent({ viewCount: 100_000 }, "2026-07-04");
    event.artistId = undergroundArtist.id;
    const signal = buildEventMarketSignals({
      artists: [undergroundArtist],
      runDate: "2026-07-11",
      eventsByArtist: { [undergroundArtist.id]: [event] }
    })[undergroundArtist.id];
    const events = signal.rawPayload.events as Array<{ evidenceSafetyMultiplier: number }>;

    expect(events[0].evidenceSafetyMultiplier).toBeGreaterThan(
      evidenceMultiplier(releaseEvent({ viewCount: 100_000 }, "2026-07-04"))
    );
  });
});

describe("release performance and reception", () => {
  function releaseWithViews(viewCount: number): MarketEvent {
    return {
      artistId: artist.id,
      eventDate: "2026-07-04",
      eventType: "release",
      title: "Young Thug releases Example, a new album",
      sourceName: "YouTube",
      sourceUrl: "https://youtube.com/watch?v=example",
      sentimentScore: 55,
      impactScore: 70,
      confidence: 0.9,
      rawPayload: {
        source: "youtube_upload_event",
        releaseKind: "album",
        artistCategory: artist.category,
        artistCurrentPrice: artist.currentPrice,
        viewCount
      }
    };
  }

  function receptionEvent(sentiment: number): MarketEvent {
    return {
      artistId: artist.id,
      eventDate: "2026-07-05",
      eventType: "review",
      title: sentiment < 0 ? "Example receives poor reviews" : "Example receives strong reviews",
      sourceName: "Music reviewer",
      sourceUrl: `https://review.test/example-${sentiment}`,
      sentimentScore: sentiment,
      impactScore: sentiment,
      confidence: 0.9,
      rawPayload: {
        source: "manual_event",
        sourceType: "review",
        publicReactionConfirmed: true,
        fanReactionEvidenceCount: 2
      }
    };
  }

  function totalPriceShock(events: MarketEvent[]) {
    const signal = buildEventMarketSignals({
      artists: [artist],
      runDate: "2026-07-11",
      eventsByArtist: { [artist.id]: events }
    })[artist.id];

    return (signal.modifiers ?? []).reduce((total, modifier) => total + (modifier.priceShock ?? 0), 0);
  }

  it("keeps viral reach separate from poor reception", () => {
    const poorReception = receptionEvent(-75);
    const viralButPoor = totalPriceShock([releaseWithViews(3_000_000), poorReception]);
    const weakAndPoor = totalPriceShock([releaseWithViews(50_000), poorReception]);
    const viralAndPositive = totalPriceShock([releaseWithViews(3_000_000), receptionEvent(75)]);

    expect(viralButPoor).toBeGreaterThan(weakAndPoor);
    expect(viralButPoor).toBeLessThan(viralAndPositive);
  });
});

describe("trusted editorial video catalysts", () => {
  it("gives a music interview a modest, source-verified price effect", () => {
    const event: MarketEvent = {
      artistId: artist.id,
      eventDate: "2026-07-11",
      eventType: "news",
      title: "Young Thug explains the lyrics and meaning behind a new song",
      sourceName: "Genius",
      sourceUrl: "https://www.youtube.com/watch?v=VideoId123",
      sentimentScore: 14,
      impactScore: 22,
      confidence: 0.84,
      rawPayload: {
        source: "youtube_editorial_event",
        videoId: "VideoId123",
        publisherAuthority: "primary",
        classificationReason: "music_interview",
        musicDemandConfirmed: true,
        viewCount: 100_000,
        reachRatio: 1.2
      }
    };
    const signal = buildEventMarketSignals({
      artists: [artist],
      runDate: "2026-07-11",
      eventsByArtist: { [artist.id]: [event] }
    })[artist.id];
    const modifier = signal.modifiers?.[0];
    const scoredEvents = signal.rawPayload.events as Array<{ eventSubtype: string; provenanceLabel: string }>;

    expect(scoredEvents[0]).toMatchObject({
      eventSubtype: "music_interview",
      provenanceLabel: "trusted-editorial-video"
    });
    expect(modifier?.reason).toContain("music interview");
    expect(modifier?.priceShock).toBeGreaterThan(0);
    expect(modifier?.priceShock).toBeLessThan(0.01);
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
