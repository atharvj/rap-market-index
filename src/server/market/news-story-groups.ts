import { isOfficialRecordingSource, resolveRecordingArtists } from "@/server/market/recording-credits";
import { hasNewsArtistAttribution } from "@/server/market/news-artist-attribution";

export type NewsStoryEvent = {
  id: string;
  artist_id: string;
  event_date: string;
  event_type?: string;
  title: string;
  source_url: string | null;
  raw_payload?: unknown;
};

export type NewsStoryArtist = {
  id: string;
  name: string;
  ticker: string;
};

export type NewsStoryGroup<T extends NewsStoryEvent> = {
  primary: T;
  events: T[];
};

export function groupNewsStoryEvents<T extends NewsStoryEvent>(
  events: T[],
  preferredArtistIds: ReadonlySet<string> = new Set()
): NewsStoryGroup<T>[] {
  const grouped: T[][] = [];

  for (const event of events) {
    const existing = grouped.find((storyEvents) =>
      storyEvents.some((storyEvent) => areNewsStoryEventsEquivalent(event, storyEvent))
    );

    if (existing) {
      existing.push(event);
    } else {
      grouped.push([event]);
    }
  }

  return grouped.map((storyEvents) => ({
    primary:
      storyEvents.find((event) => preferredArtistIds.has(event.artist_id)) ??
      storyEvents[0],
    events: storyEvents
  }));
}

export function areNewsStoryEventsEquivalent(first: NewsStoryEvent, second: NewsStoryEvent) {
  const firstUrl = normalizeNewsSourceUrl(first.source_url);
  const secondUrl = normalizeNewsSourceUrl(second.source_url);

  if (firstUrl && secondUrl && firstUrl === secondUrl) {
    return true;
  }

  const dayGap = getNewsStoryDayGap(first.event_date, second.event_date);

  if (dayGap === null || dayGap > 4) {
    return false;
  }

  const firstHeadline = normalizeNewsStoryHeadline(first.title);
  const secondHeadline = normalizeNewsStoryHeadline(second.title);

  if (firstHeadline && firstHeadline === secondHeadline) {
    return true;
  }

  if (first.event_type && second.event_type && first.event_type !== second.event_type) {
    return false;
  }

  const bothReleases = first.event_type === "release" && second.event_type === "release";

  if (dayGap > 0 && bothReleases && hasReleaseLifecycleMismatch(first.title, second.title)) {
    return false;
  }

  const firstTokens = getDistinctiveNewsStoryTokens(first.title);
  const secondTokens = getDistinctiveNewsStoryTokens(second.title);
  const shared = [...firstTokens].filter((token) => secondTokens.has(token)).length;
  const smallerSize = Math.min(firstTokens.size, secondTokens.size);
  const containment = shared / Math.max(1, smallerSize);
  const differentArtists = first.artist_id !== second.artist_id;
  const sameRelease = bothReleases && shared >= 2 && containment >= 0.5;
  const sharedPhrase = hasSharedDistinctiveNewsStoryPhrase(first.title, second.title);

  if (differentArtists) {
    // Separate articles about different artists at the same event are not
    // interchangeable evidence. Exact URLs/headlines were handled above.
    return false;
  }

  return shared >= 4 || (shared >= 3 && (containment >= 0.5 || sharedPhrase)) || sameRelease;
}

export function getNewsStoryKey(event: NewsStoryEvent) {
  const headline = normalizeNewsStoryHeadline(event.title);

  if (headline) {
    return `headline:${event.event_date}:${headline}`;
  }

  const sourceUrl = normalizeNewsSourceUrl(event.source_url);

  if (sourceUrl) {
    return `url:${sourceUrl}`;
  }

  return `event:${event.event_date}:${event.id}`;
}

export function resolveNewsStoryArtists<T extends NewsStoryEvent>({
  primary,
  events,
  artists
}: {
  primary: T;
  events: T[];
  artists: NewsStoryArtist[];
}) {
  const artistById = new Map(artists.map((artist) => [artist.id, artist]));
  const artistByName = new Map(artists.map((artist) => [normalizeArtistIdentity(artist.name), artist]));
  const artistByTicker = new Map(artists.map((artist) => [artist.ticker.toUpperCase(), artist]));
  const attributionPayload = { ...toRecord(primary.raw_payload) };
  const primaryUrl = normalizeNewsSourceUrl(primary.source_url);
  const publisherDescriptions = [primary, ...events.filter(event => event.id !== primary.id)]
    .filter(event => primaryUrl && normalizeNewsSourceUrl(event.source_url) === primaryUrl &&
      normalizeNewsStoryHeadline(event.title) === normalizeNewsStoryHeadline(primary.title))
    .map(event => toRecord(event.raw_payload))
    .filter(payload => payload.publisherArticleVerified === true && payload.publisherHeadlineVerified === true &&
      typeof payload.publisherDescription === "string")
    .map(payload => payload.publisherDescription as string);
  if (publisherDescriptions.length) {
    attributionPayload.publisherArticleVerified = true;
    attributionPayload.publisherDescription = [...new Set(publisherDescriptions)].join(" ");
  }
  const selected: NewsStoryArtist[] = [];
  const seen = new Set<string>();
  const addArtist = (artist: NewsStoryArtist | undefined) => {
    if (!artist || seen.has(artist.id) || !hasNewsArtistAttribution({
      artistName: artist.name, title: primary.title, rawPayload: attributionPayload
    })) {
      return;
    }

    seen.add(artist.id);
    selected.push(artist);
  };
  const orderedEvents = [primary, ...events.filter((event) => event.id !== primary.id)];

  if (isOfficialRecordingSource(toRecord(primary.raw_payload))) {
    const raw = toRecord(primary.raw_payload);
    return resolveRecordingArtists({ title: typeof raw.recordingTitle === "string" ? raw.recordingTitle : primary.title,
      description: typeof raw.performerCreditText === "string" ? raw.performerCreditText : undefined,
      primaryArtistId: typeof raw.recordingPrimaryArtistId === "string" ? raw.recordingPrimaryArtistId : primary.artist_id,
      artists });
  }

  for (const event of orderedEvents) {
    addArtist(artistById.get(event.artist_id));
  }

  for (const event of orderedEvents) {
    const payload = toRecord(event.raw_payload);

    for (const artistId of getStringArray(payload.relatedArtistIds)) {
      addArtist(artistById.get(artistId));
    }

    for (const artistName of getStringArray(payload.relatedArtistNames)) {
      addArtist(artistByName.get(normalizeArtistIdentity(artistName)));
    }

    for (const ticker of getStringArray(payload.relatedArtistTickers)) {
      addArtist(artistByTicker.get(ticker.toUpperCase()));
    }
  }

  // Recover genuine mentions in this article using the verified alias registry.
  // Neither another grouped article nor a related-ID list can supply a badge.
  for (const artist of artists) addArtist(artist);

  return selected;
}

export function normalizeNewsSourceUrl(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    url.hash = "";

    for (const key of [...url.searchParams.keys()]) {
      if (
        key.toLowerCase().startsWith("utm_") ||
        ["fbclid", "gclid", "mc_cid", "mc_eid", "ref", "ref_src"].includes(key.toLowerCase())
      ) {
        url.searchParams.delete(key);
      }
    }

    url.hostname = url.hostname.toLowerCase();
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString();
  } catch {
    return null;
  }
}

function normalizeNewsStoryHeadline(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+(?:-|\|)\s+(?:[a-z0-9]+(?:\.[a-z]{2,})?|[a-z0-9 .&-]+)$/i, "")
    .replace(/\bhotnewhiphop\b/g, "")
    .replace(/\s+-\s+[a-z0-9 .&]+$/i, "")
    .replace(/[’']s\b/g, "")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getDistinctiveNewsStoryTokens(value: string) {
  return new Set(getDistinctiveNewsStoryTokenList(value));
}

function hasSharedDistinctiveNewsStoryPhrase(first: string, second: string) {
  const firstTokens = getDistinctiveNewsStoryTokenList(first);
  const secondPhrases = new Set(getNewsStoryBigrams(getDistinctiveNewsStoryTokenList(second)));

  return getNewsStoryBigrams(firstTokens).some((phrase) => secondPhrases.has(phrase));
}

function getNewsStoryBigrams(tokens: string[]) {
  return tokens.slice(0, -1).map((token, index) => `${token} ${tokens[index + 1]}`);
}

function getDistinctiveNewsStoryTokenList(value: string) {
  return normalizeNewsStoryHeadline(value)
    .split(" ")
    .filter((token) => token.length >= 2 && !NEWS_STORY_IGNORED_TOKENS.has(token) && !/^20\d{2}$/.test(token));
}

const NEWS_STORY_IGNORED_TOKENS = new Set([
  "a", "an", "and", "at", "by", "for", "from", "in", "is", "it", "new", "of", "on", "the", "to", "with",
  "announces", "audio", "delivers", "drops", "feat", "featuring", "ft", "hear", "listen", "music", "official",
  "rap", "rapper", "release", "released", "releases", "reveals", "says", "shares", "single", "song", "track",
  "unveils", "video", "watch"
]);

function getNewsStoryDayGap(firstDate: string, secondDate: string) {
  const first = Date.parse(`${firstDate}T00:00:00Z`);
  const second = Date.parse(`${secondDate}T00:00:00Z`);

  return Number.isFinite(first) && Number.isFinite(second)
    ? Math.abs(Math.round((first - second) / 86_400_000))
    : null;
}

function hasReleaseLifecycleMismatch(firstTitle: string, secondTitle: string) {
  const first = normalizeNewsStoryHeadline(firstTitle);
  const second = normalizeNewsStoryHeadline(secondTitle);
  const firstIsVideo = /\b(?:music video|visualizer|video)\b/.test(first);
  const secondIsVideo = /\b(?:music video|visualizer|video)\b/.test(second);

  return firstIsVideo !== secondIsVideo;
}

function normalizeArtistIdentity(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    : [];
}
