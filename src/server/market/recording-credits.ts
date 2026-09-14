import { buildDefaultLastfmName } from "@/server/market/artist-text-identifiers";
import type { MarketEvent } from "@/server/market/market-data";

export type RecordingArtist = { id: string; name: string; ticker: string; category?: string; currentPrice?: number; hypeScore?: number };

/** Only explicit performing credits on an official upload count. A song title,
 * producer credit, shout-out or description mention is not a feature credit. */
export function resolveRecordingArtists<T extends RecordingArtist>({
  title, description, primaryArtistId, artists
}: { title: string; description?: string | null; primaryArtistId: string; artists: T[] }): T[] {
  const names: string[] = [];
  const prefix = title.split(/\s+[-–—]\s+/)[0];
  if (prefix !== title) names.push(...splitCredits(prefix));
  for (const match of title.matchAll(/\b(?:feat\.?|ft\.?|featuring)\s+([^()[\]]+)/gi)) names.push(...splitCredits(match[1]));
  for (const line of (description ?? "").split(/\r?\n/)) {
    const match = line.match(/^\s*(?:artists?|performers?|performed by|vocals(?: by)?)\s*:\s*(.+)$/i);
    if (match) names.push(...splitCredits(match[1]));
  }
  const explicit = new Set(names.map(normalize));
  return artists.filter(artist => artist.id === primaryArtistId ||
    [artist.name, buildDefaultLastfmName(artist.name)].some(name => explicit.has(normalize(name))))
    .sort((a, b) => Number(b.id === primaryArtistId) - Number(a.id === primaryArtistId));
}

function splitCredits(text: string) {
  return text.split(/\s*(?:,|&|\bfeat\.?\s|\bft\.?\s|\bfeaturing\s|\s[xX×]\s|\band\b|·)\s*/i)
    .map(value => value.trim()).filter(Boolean);
}

function normalize(text: string) {
  return text.toLowerCase().replace(/\$/g, "s").replace(/[^a-z0-9]/g, "");
}

export function isOfficialRecordingSource(raw: Record<string, unknown>) {
  return raw.source === "youtube_upload_event" &&
    !["official_audio_release_cluster", "album_upload_title", "ep_upload_title"].includes(String(raw.classificationReason));
}

export function expandRecordingEvents(eventsByArtist: Record<string, MarketEvent[]>, artists: RecordingArtist[]) {
  const grouped: Record<string, Map<string, MarketEvent>> = {};
  for (const events of Object.values(eventsByArtist)) {
    for (const event of events) {
      const raw = event.rawPayload;
      const recordingTitle = typeof raw.recordingTitle === "string" ? raw.recordingTitle : event.title;
      const primaryArtistId = typeof raw.recordingPrimaryArtistId === "string" ? raw.recordingPrimaryArtistId : event.artistId;
      const participants = isOfficialRecordingSource(raw)
        ? resolveRecordingArtists({ title: recordingTitle, description: typeof raw.performerCreditText === "string" ? raw.performerCreditText : undefined, primaryArtistId, artists })
        : artists.filter(artist => artist.id === event.artistId);
      for (const participant of participants) {
        // A saved collaborator row already has that artist's audience context.
        // Do not propagate it back onto the original performer's event.
        if (primaryArtistId !== event.artistId && participant.id !== event.artistId) continue;
        const primary = participant.id === primaryArtistId;
        const prefixNames = splitCredits(recordingTitle.split(/\s+[-–—]\s+/)[0]).map(normalize);
        const coArtist = prefixNames.includes(normalize(participant.name));
        const updated = isOfficialRecordingSource(raw) ? {
          ...event, artistId: participant.id,
          rawPayload: { ...raw, recordingPrimaryArtistId: primaryArtistId,
            ...(!primary ? { artistCategory: participant.category ?? null, artistCurrentPrice: participant.currentPrice ?? null, artistHypeScore: participant.hypeScore ?? null } : {}),
            relatedArtistIds: participants.map(artist => artist.id),
            artistRole: primary ? "primary" : coArtist ? "co_artist" : "featured", recordingCreditsVerified: true }
        } : event;
        grouped[participant.id] ??= new Map();
        grouped[participant.id].set(`${event.sourceUrl ?? event.title}:${event.eventDate}`, updated);
      }
    }
  }
  return Object.fromEntries(Object.entries(grouped).map(([id, events]) => [id, [...events.values()]]));
}
