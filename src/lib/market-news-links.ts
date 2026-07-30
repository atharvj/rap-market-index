type NewsLinkItem = {
  eventType: string;
  sourceUrl?: string | null;
  mediaUrl?: string | null;
  mediaType?: string | null;
  mediaLabel?: string | null;
};

type NewsSourceEvent = {
  source_url: string | null;
};

const DIRECT_MEDIA_HOSTS = new Set([
  "music.apple.com",
  "open.spotify.com",
  "soundcloud.com",
  "tidal.com",
  "youtube.com",
  "youtu.be"
]);

export function shouldShowNewsMediaAction(item: NewsLinkItem) {
  return item.eventType === "release" && Boolean(item.mediaUrl && item.mediaLabel);
}

export function shouldShowNewsSourceAction(item: NewsLinkItem) {
  if (!item.sourceUrl) {
    return false;
  }

  return !shouldShowNewsMediaAction(item) || !areEquivalentNewsLinks(item.sourceUrl, item.mediaUrl);
}

export function selectPreferredNewsSourceEvent<T extends NewsSourceEvent>(
  primary: T,
  storyEvents: T[]
) {
  const candidates = [
    primary,
    ...storyEvents.filter((event) => event !== primary)
  ].filter((event) => isHttpNewsLink(event.source_url));

  return candidates.find((event) => !isDirectMediaNewsLink(event.source_url)) ?? candidates[0] ?? primary;
}

export function areEquivalentNewsLinks(first?: string | null, second?: string | null) {
  const firstKey = getComparableNewsLink(first);
  const secondKey = getComparableNewsLink(second);

  return Boolean(firstKey && secondKey && firstKey === secondKey);
}

function getComparableNewsLink(value?: string | null) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    const youtubeId = getYoutubeId(url);

    if (youtubeId) {
      return `youtube:${youtubeId}`;
    }

    url.hash = "";

    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase().startsWith("utm_") || ["fbclid", "gclid", "ref"].includes(key.toLowerCase())) {
        url.searchParams.delete(key);
      }
    }

    url.hostname = normalizeHostname(url.hostname);
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString();
  } catch {
    return null;
  }
}

function isHttpNewsLink(value: string | null) {
  if (!value) {
    return false;
  }

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isDirectMediaNewsLink(value: string | null) {
  if (!value) {
    return false;
  }

  try {
    const hostname = normalizeHostname(new URL(value).hostname);
    return DIRECT_MEDIA_HOSTS.has(hostname) || hostname.endsWith(".soundcloud.com");
  } catch {
    return false;
  }
}

function getYoutubeId(url: URL) {
  const hostname = normalizeHostname(url.hostname);
  const candidate =
    hostname === "youtu.be"
      ? url.pathname.split("/").filter(Boolean)[0] ?? ""
      : hostname === "youtube.com"
        ? url.searchParams.get("v") ?? url.pathname.match(/\/(?:embed|shorts)\/([^/?]+)/)?.[1] ?? ""
        : "";

  return /^[A-Za-z0-9_-]{6,20}$/.test(candidate) ? candidate : null;
}

function normalizeHostname(hostname: string) {
  return hostname.toLowerCase().replace(/^www\./, "");
}
