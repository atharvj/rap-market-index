import { hasRequiredArtistEventDisambiguation } from "@/server/market/artist-event-disambiguation";
import { getTrackingAliases, getTrackingIdentities, matchTrackedRelease, normalizeTrackingText } from "@/server/market/artist-tracking";
import type { ArtistExternalIds } from "@/server/market/market-data";

type Identity = { id: string; name: string };

// The roster is finite, so a refresh of one artist can still recognize someone
// outside that batch. Caller-supplied identities cover newly added listings.
export function createArtistReceptionSelector(artists: Identity[], externalIds: Record<string, ArtistExternalIds>, runDate: string) {
  const identities = [...new Map([...getTrackingIdentities(), ...artists].map(artist => [artist.id, artist])).values()];
  const names = new Map(identities.map(artist => [artist.id, getTrackingAliases(artist, externalIds[artist.id]).map(normalizeTrackingText)]));
  const mentioned = (text: string, artist: Identity) => {
    const normalized = normalizeTrackingText(text);
    return names.get(artist.id)?.some(name => name && (` ${normalized} `.includes(` ${name} `) ||
      (name.replace(/ /g, "").length > 4 && ` ${normalized} `.includes(` ${name.replace(/ /g, "")} `))));
  };
  return (text: string, artist: Identity) => {
    text = text.replace(/https?:\/\/\S+/gi, " ");
    const others = identities.filter(other => other.id !== artist.id && mentioned(text, other) &&
      hasRequiredArtistEventDisambiguation({ artistName: other.name, text }));
    if (!others.length) return text;
    // Unanchored pronouns and unresolved comparisons are unknown. A generic
    // comment on a verified collaboration can still describe the shared song.
    return text.replace(/https?:\/\/\S+/g, " ").split(/(?<!\d)\.(?!\d)|[;!?\n]|\b(?:but|whereas|while|however)\b/i)
      .filter(clause => (mentioned(clause, artist) || matchTrackedRelease(clause, artist, runDate, externalIds[artist.id])) &&
        !others.some(other => mentioned(clause, other)))
      .join(". ");
  };
}

export function getLongReactionCopyKey(text: string) {
  const normalized = normalizeTrackingText(text.replace(/https?:\/\/\S+/gi, " ").replace(/@[\w.-]+/g, " "));
  return normalized.length >= 48 && normalized.split(" ").length >= 9 ? normalized : null;
}
