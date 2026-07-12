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
