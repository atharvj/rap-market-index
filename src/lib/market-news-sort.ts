export type MarketNewsSort = "top" | "latest" | "impact" | "confidence";

type SortableMarketNewsEvent = {
  id: string;
  event_date: string;
  created_at?: string | null;
  impact_score: number | string;
  confidence: number | string;
};

export function normalizeMarketNewsSort(value: string | null | undefined): MarketNewsSort {
  return value === "latest" || value === "impact" || value === "confidence" ? value : "top";
}

export function sortMarketNewsEvents<T extends SortableMarketNewsEvent>(
  events: T[],
  sort: MarketNewsSort,
  getTopScore: (event: T) => number = () => 0
) {
  return [...events].sort((first, second) => {
    const primaryDifference = getPrimaryDifference(first, second, sort, getTopScore);

    if (primaryDifference !== 0) {
      return primaryDifference;
    }

    const recencyDifference = getEventTimestamp(second) - getEventTimestamp(first);

    if (recencyDifference !== 0) {
      return recencyDifference;
    }

    return first.id.localeCompare(second.id);
  });
}

function getPrimaryDifference<T extends SortableMarketNewsEvent>(
  first: T,
  second: T,
  sort: MarketNewsSort,
  getTopScore: (event: T) => number
) {
  if (sort === "latest") {
    return getEventTimestamp(second) - getEventTimestamp(first);
  }

  if (sort === "impact") {
    return Math.abs(toFiniteNumber(second.impact_score)) - Math.abs(toFiniteNumber(first.impact_score));
  }

  if (sort === "confidence") {
    return toFiniteNumber(second.confidence) - toFiniteNumber(first.confidence);
  }

  return getTopScore(second) - getTopScore(first);
}

function getEventTimestamp(event: SortableMarketNewsEvent) {
  const eventDate = Date.parse(`${event.event_date}T12:00:00Z`);
  const createdAt = event.created_at ? Date.parse(event.created_at) : Number.NaN;
  const dayStart = Number.isFinite(eventDate) ? eventDate : 0;
  const timeWithinDay = Number.isFinite(createdAt) ? createdAt % 86_400_000 : 0;

  return dayStart + timeWithinDay;
}

function toFiniteNumber(value: number | string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
