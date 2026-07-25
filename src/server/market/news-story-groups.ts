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
    return shared >= 4 && containment >= 0.4;
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
  const selected: NewsStoryArtist[] = [];
  const seen = new Set<string>();
  const addArtist = (artist: NewsStoryArtist | undefined) => {
    if (!artist || seen.has(artist.id)) {
      return;
    }

    seen.add(artist.id);
    selected.push(artist);
  };
  const orderedEvents = [primary, ...events.filter((event) => event.id !== primary.id)];

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

  // Older feed rows and third-party RSS results do not always include structured
  // co-artist metadata. Recover only exact, unambiguous roster names from the
  // visible headline so collaboration stories are not credited to one artist.
  for (const event of orderedEvents) {
    const headline = normalizeArtistMentionText(event.title);

    for (const artist of artists) {
      if (isSafeExplicitHeadlineMention(headline, artist.name)) {
        addArtist(artist);
      }
    }
  }

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

const AMBIGUOUS_HEADLINE_ARTIST_NAMES = new Set([
  "autumn",
  "che",
  "feng",
  "future",
  "ian",
  "nav",
  "protect",
  "tana",
  "ye"
]);

function isSafeExplicitHeadlineMention(normalizedHeadline: string, artistName: string) {
  const normalizedArtist = normalizeArtistMentionText(artistName);
  const compactArtist = normalizedArtist.replace(/\s+/g, "");

  if (
    !normalizedArtist ||
    compactArtist.length <= 4 ||
    AMBIGUOUS_HEADLINE_ARTIST_NAMES.has(normalizedArtist)
  ) {
    return false;
  }

  return ` ${normalizedHeadline} `.includes(` ${normalizedArtist} `);
}

function normalizeArtistMentionText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\$/g, "s")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
