import { hasRequiredArtistEventDisambiguation } from "@/server/market/artist-event-disambiguation";

export function getNewsAttributionText(title: string, rawPayload: Record<string, unknown>) {
  const evidence = [title];
  // Stored search queries, claimed match flags and related IDs are not evidence
  // that the returned article actually discusses an artist.
  if (rawPayload.publisherArticleVerified === true) {
    if (rawPayload.publisherHeadlineVerified === true && typeof rawPayload.publisherHeadline === "string") {
      evidence.push(rawPayload.publisherHeadline);
    }
    if (typeof rawPayload.publisherDescription === "string") evidence.push(rawPayload.publisherDescription);
  }
  return evidence.join(" ");
}

export function hasNewsArtistAttribution({
  artistName, title, rawPayload
}: { artistName: string; title: string; rawPayload: Record<string, unknown> }) {
  if (rawPayload.artistAttributionRejected === true) return false;
  return hasRequiredArtistEventDisambiguation({
    artistName,
    text: getNewsAttributionText(title, rawPayload)
  });
}
