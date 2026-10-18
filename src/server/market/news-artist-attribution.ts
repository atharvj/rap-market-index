import { hasRequiredArtistEventDisambiguation } from "@/server/market/artist-event-disambiguation";

export function getNewsAttributionText(title: string, rawPayload: Record<string, unknown>) {
  // Legacy event titles can be synthesized (for example, "Drake - ...").
  // A verified publisher headline takes precedence over that claimed identity.
  const publisherHeadline = rawPayload.publisherArticleVerified === true &&
    rawPayload.publisherHeadlineVerified === true && typeof rawPayload.publisherHeadline === "string" &&
    rawPayload.publisherHeadline.trim() ? rawPayload.publisherHeadline : null;
  const evidence = [publisherHeadline ?? title];
  // Stored search queries, claimed match flags and related IDs are not evidence
  // that the returned article actually discusses an artist.
  if (rawPayload.publisherArticleVerified === true) {
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
