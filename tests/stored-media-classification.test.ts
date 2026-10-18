import { expect, it } from "vitest";
import { classifyStoredMediaEvent } from "@/server/market/stored-media-classification";
import type { MarketEvent } from "@/server/market/market-data";

it("keeps verified guest credits eligible through the same classifier used by collection gates and price scoring", () => {
  const event: MarketEvent = { artistId: "eminem", eventDate: "2026-10-16", eventType: "viral",
    title: "Eminem - Halfway to Jesus", sentimentScore: 30, impactScore: 48, confidence: 0.8,
    sourceUrl: "https://www.billboard.com/music/rock/kid-rock-album/", rawPayload: {
      source: "media_rss_item", publisherArticleVerified: true, publisherHeadlineVerified: true,
      publisherHeadline: "Kid Rock Releases New Album Featuring Eminem", publisherDescription: "Eminem contributes a guest verse." } };
  expect(classifyStoredMediaEvent(event, "Eminem")).toMatchObject({ eventType: "viral", reason: "feature_terms" });
  expect(classifyStoredMediaEvent(event, "Kid Rock")).toMatchObject({ eventType: "release" });
});
