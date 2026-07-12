export type NewsStoryEvent = {
  id: string;
  artist_id: string;
  event_date: string;
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
  const grouped = new Map<string, T[]>();

  for (const event of events) {
    const key = getNewsStoryKey(event);
    const current = grouped.get(key) ?? [];
    current.push(event);
    grouped.set(key, current);
  }

  return [...grouped.values()].map((storyEvents) => ({
    primary:
      storyEvents.find((event) => preferredArtistIds.has(event.artist_id)) ??
      storyEvents[0],
    events: storyEvents
  }));
}

export function getNewsStoryKey(event: NewsStoryEvent) {
  const sourceUrl = normalizeNewsSourceUrl(event.source_url);

  if (sourceUrl) {
    return `url:${sourceUrl}`;
  }

  return `headline:${event.event_date}:${normalizeNewsStoryHeadline(event.title)}`;
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
    .replace(/\s+-\s+[a-z0-9 .&]+$/i, "")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
