export type MarketNewsSort = "top" | "latest";

type SortableMarketNewsEvent = {
  id: string;
  event_date: string;
  created_at?: string | null;
  impact_score: number | string;
  confidence: number | string;
};

export function normalizeMarketNewsSort(value: string | null | undefined): MarketNewsSort {
  return value === "latest" ? value : "top";
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

  return getTopScore(second) - getTopScore(first);
}

function getEventTimestamp(event: SortableMarketNewsEvent) {
  const eventDate = Date.parse(`${event.event_date}T12:00:00Z`);
  const createdAt = event.created_at ? Date.parse(event.created_at) : Number.NaN;
  const dayStart = Number.isFinite(eventDate) ? eventDate : 0;
  const timeWithinDay = Number.isFinite(createdAt) ? createdAt % 86_400_000 : 0;

  return dayStart + timeWithinDay;
}
