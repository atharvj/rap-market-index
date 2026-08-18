export type MarketNewsTagKey =
  | "release"
  | "review"
  | "news"
  | "controversy"
  | "award"
  | "tour"
  | "viral";

export const MARKET_NEWS_TAG_OPTIONS: Array<{ key: MarketNewsTagKey; label: string }> = [
  { key: "release", label: "Releases" },
  { key: "review", label: "Reviews" },
  { key: "tour", label: "Tours & Shows" },
  { key: "award", label: "Awards" },
  { key: "viral", label: "Viral" },
  { key: "controversy", label: "Controversies" },
  { key: "news", label: "Other News" }
];

const PRIMARY_LABELS: Record<MarketNewsTagKey, string> = {
  release: "Release",
  review: "Review",
  news: "News",
  controversy: "Controversy",
  award: "Award",
  tour: "Tour",
  viral: "Viral"
};

type MarketNewsTagInput = {
  eventType: string;
  eventLabel?: string | null;
  title: string;
};

export function getMarketNewsTags(input: MarketNewsTagInput) {
  const tags: string[] = [];
  const eventType = normalizeMarketNewsTag(input.eventType);
  const title = input.title.toLowerCase();

  addUnique(tags, input.eventLabel ?? "");

  if (eventType) {
    addUnique(tags, PRIMARY_LABELS[eventType]);
  }

  if (/\b(tour|concert|festival|live show|headline show|performance|performed|performs)\b/i.test(title)) {
    addUnique(tags, "Tour");
  }

  if (/\b(album|ep|mixtape|single|song|track|music video|released?|drops?)\b/i.test(title)) {
    addUnique(tags, "Release");
  }

  if (/\b(grammy|award|nomination|nominated|wins?|honored)\b/i.test(title)) {
    addUnique(tags, "Award");
  }

  if (/\b(arrest|charged|lawsuit|legal|controversy|backlash|feud|diss|allegation)\b/i.test(title)) {
    addUnique(tags, "Controversy");
  }

  return tags.slice(0, 3);
}

export function marketNewsHasTag(input: MarketNewsTagInput, tag: MarketNewsTagKey) {
  if (input.eventType === tag) {
    return true;
  }

  const expectedLabel = PRIMARY_LABELS[tag];
  return getMarketNewsTags(input).some((label) => label === expectedLabel);
}

export function normalizeMarketNewsTag(value: string | null): MarketNewsTagKey | null {
  return MARKET_NEWS_TAG_OPTIONS.some((option) => option.key === value)
    ? value as MarketNewsTagKey
    : null;
}

function addUnique(tags: string[], label: string) {
  const normalized = label.trim();

  if (normalized && !tags.some((tag) => tag.toLowerCase() === normalized.toLowerCase())) {
    tags.push(normalized);
  }
}
