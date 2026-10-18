import { classifyArticleEvent, normalizeDomain } from "@/server/market/gdelt-source";
import { hasArtistFeatureCreditContext } from "@/server/market/artist-event-disambiguation";
import { getNewsAttributionText } from "@/server/market/news-artist-attribution";
import type { MarketEvent } from "@/server/market/market-data";

export function getStoredMediaHeadline(event: MarketEvent) {
  const raw = event.rawPayload;
  return raw.publisherArticleVerified === true && raw.publisherHeadlineVerified === true &&
    typeof raw.publisherHeadline === "string" && raw.publisherHeadline.trim() ? raw.publisherHeadline : event.title;
}

/** Collection and all stored-event gates must agree about genuine guest credits. */
export function classifyStoredMediaEvent(event: MarketEvent, artistName: string) {
  const raw = event.rawPayload;
  const text = getNewsAttributionText(event.title, raw);
  const domain = normalizeDomain(typeof raw.domain === "string" ? raw.domain : undefined, event.sourceUrl) ?? "";
  const classification = classifyArticleEvent(text, domain, raw.tone, { allowLowTierRelease: true });
  return classification?.eventType === "release" && hasArtistFeatureCreditContext({ artistName, text })
    ? { ...classification, eventType: "viral" as const, reason: "feature_terms", releaseKind: undefined }
    : classification;
}
