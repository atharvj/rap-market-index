import { describe, expect, it } from "vitest";
import {
  hasVerifiedAiResearchArticleProvenance,
  isMarketEventSourceIntegrityValid
} from "@/server/market/event-integrity";
import type { MarketEvent } from "@/server/market/market-data";

const identity = {
  eventDate: "2026-08-09",
  title: "Kendrick Lamar Announces a New Tour",
  sourceUrl: "https://pitchfork.com/news/kendrick-lamar-announces-new-tour/"
};

const verifiedRawPayload = {
  source: "ai_research_event",
  evidenceVersion: 2,
  sourceUrlExactSearchMatch: true,
  publisherArticleVerified: true,
  publisherDateVerified: true,
  publisherHeadlineVerified: true,
  publisherCanonicalUrl: identity.sourceUrl,
  publisherPublishedDate: identity.eventDate,
  publisherHeadline: identity.title
};

describe("AI research event integrity", () => {
  it("fails closed for every legacy event without publisher proof", () => {
    const event: MarketEvent = {
      artistId: "kendrick-lamar",
      eventDate: "2026-08-07",
      eventType: "review",
      title: "Kendrick Lamar's GNX Continues to Receive Critical Acclaim",
      sourceName: "Pitchfork",
      sourceUrl: "https://pitchfork.com/artists/29812-kendrick-lamar",
      sentimentScore: 83.95,
      impactScore: 70,
      confidence: 0.9,
      rawPayload: { source: "ai_research_event", aiValidated: true }
    };

    expect(isMarketEventSourceIntegrityValid(event)).toBe(false);
  });

  it("requires the stored event to match the publisher title, date, and canonical URL", () => {
    expect(hasVerifiedAiResearchArticleProvenance(verifiedRawPayload, identity)).toBe(true);
    expect(hasVerifiedAiResearchArticleProvenance(verifiedRawPayload, {
      ...identity,
      eventDate: "2026-08-08"
    })).toBe(false);
    expect(hasVerifiedAiResearchArticleProvenance(verifiedRawPayload, {
      ...identity,
      title: "A synthetic replacement headline"
    })).toBe(false);
    expect(hasVerifiedAiResearchArticleProvenance(verifiedRawPayload, {
      ...identity,
      sourceUrl: "https://pitchfork.com/artists/29812-kendrick-lamar"
    })).toBe(false);
  });
});
