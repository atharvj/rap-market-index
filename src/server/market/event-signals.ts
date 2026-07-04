import { clamp } from "@/lib/pricing";
import type { MarketUpdateArtist } from "@/server/market/daily-update";
import type { AdapterSignals, MarketEvent, MarketSignalModifier } from "@/server/market/market-data";
import type { HypeStats } from "@/lib/types";

export type ManualMarketEventInput = {
  artistId?: string;
  ticker?: string;
  eventDate?: string;
  eventType?: MarketEvent["eventType"];
  title?: string;
  sourceName?: string;
  sourceUrl?: string;
  sentimentScore?: number;
  impactScore?: number;
  confidence?: number;
  rawPayload?: Record<string, unknown>;
};

export type ManualMarketEvents = Record<string, ManualMarketEventInput[]>;

export function buildEventMarketSignals({
  artists,
  runDate,
  eventsByArtist
}: {
  artists: MarketUpdateArtist[];
  runDate: string;
  eventsByArtist: Record<string, MarketEvent[]>;
}): AdapterSignals {
  const signals: AdapterSignals = {};

  for (const artist of artists) {
    const events = eventsByArtist[artist.id] ?? [];

    if (!events.length) {
      continue;
    }

    signals[artist.id] = buildArtistEventSignal(artist, runDate, events);
  }

  return signals;
}

export function normalizeManualMarketEvents({
  manualEvents,
  artists,
  runDate
}: {
  manualEvents?: ManualMarketEvents;
  artists: MarketUpdateArtist[];
  runDate: string;
}) {
  if (!manualEvents || typeof manualEvents !== "object") {
    return {};
  }

  const artistsById = new Map(artists.map((artist) => [artist.id, artist]));
  const artistsByTicker = new Map(artists.map((artist) => [artist.ticker, artist]));
  const normalized: Record<string, MarketEvent[]> = {};

  for (const [key, values] of Object.entries(manualEvents)) {
    const artist = artistsById.get(key) ?? artistsByTicker.get(key.toUpperCase());

    if (!artist || !Array.isArray(values)) {
      continue;
    }

    for (const value of values) {
      const event = normalizeOneManualEvent(value, artist, runDate);

      if (!event) {
        continue;
      }

      normalized[artist.id] ??= [];
      normalized[artist.id].push(event);
    }
  }

  return normalized;
}

export function normalizeManualMarketEventList({
  events,
  artists,
  runDate
}: {
  events?: ManualMarketEventInput[];
  artists: MarketUpdateArtist[];
  runDate: string;
}) {
  if (!Array.isArray(events)) {
    return {};
  }

  const artistsById = new Map(artists.map((artist) => [artist.id, artist]));
  const artistsByTicker = new Map(artists.map((artist) => [artist.ticker, artist]));
  const normalized: Record<string, MarketEvent[]> = {};

  for (const value of events) {
    const artistKey = value.artistId ?? value.ticker;
    const artist = artistKey ? artistsById.get(artistKey) ?? artistsByTicker.get(artistKey.toUpperCase()) : null;

    if (!artist) {
      continue;
    }

    const event = normalizeOneManualEvent(value, artist, runDate);

    if (!event) {
      continue;
    }

    normalized[artist.id] ??= [];
    normalized[artist.id].push(event);
  }

  return normalized;
}

export function mergeEvents(
  first: Record<string, MarketEvent[]>,
  second: Record<string, MarketEvent[]>
) {
  const merged = Object.fromEntries(
    Object.entries(first).map(([artistId, events]) => [artistId, [...events]])
  ) as Record<string, MarketEvent[]>;

  for (const [artistId, events] of Object.entries(second)) {
    const existing = new Set((merged[artistId] ?? []).map(getEventKey));
    merged[artistId] ??= [];

    for (const event of events) {
      const key = getEventKey(event);

      if (existing.has(key)) {
        continue;
      }

      existing.add(key);
      merged[artistId].push(event);
    }
  }

  return merged;
}

export function flattenEvents(eventsByArtist: Record<string, MarketEvent[]>) {
  return Object.values(eventsByArtist).flat();
}

function buildArtistEventSignal(artist: MarketUpdateArtist, runDate: string, events: MarketEvent[]) {
  const scoredEvents = events.map((event) => scoreEvent(event, runDate));
  const totalSignal = scoredEvents.reduce((total, event) => total + event.weightedImpact, 0);
  const reviewSignal = scoredEvents
    .filter((event) => event.event.eventType === "review")
    .reduce((total, event) => total + event.weightedImpact, 0);
  const releaseSignal = scoredEvents
    .filter((event) => event.event.eventType === "release")
    .reduce((total, event) => total + Math.max(0, event.weightedImpact), 0);
  const controversySignal = scoredEvents
    .filter((event) => event.event.eventType === "controversy")
    .reduce((total, event) => total + event.weightedImpact, 0);
  const newsSignal = scoredEvents
    .filter((event) => event.event.eventType === "news" || event.event.eventType === "viral")
    .reduce((total, event) => total + event.weightedImpact, 0);
  const stats: Partial<HypeStats> = {
    searchGrowth: clamp(totalSignal * 0.18 + newsSignal * 0.12, -30, 95),
    socialGrowth: clamp(totalSignal * 0.2 + releaseSignal * 0.18, -35, 120),
    newsScore: clamp(50 + totalSignal * 0.32 + reviewSignal * 0.22 + controversySignal * 0.18, 0, 100)
  };
  const modifiers = buildPriceModifiers(scoredEvents);

  return {
    stats,
    modifiers,
    confidence: getEventSignalConfidence(scoredEvents),
    rawPayload: {
      source: "market_events",
      eventCount: events.length,
      totalSignal,
      reviewSignal,
      releaseSignal,
      events: scoredEvents.map((event) => ({
        title: event.event.title,
        eventType: event.event.eventType,
        eventDate: event.event.eventDate,
        sentimentScore: event.event.sentimentScore,
        impactScore: event.event.impactScore,
        confidence: event.event.confidence,
        decay: event.decay,
        weightedImpact: event.weightedImpact
      }))
    }
  };
}

function getEventSignalConfidence(scoredEvents: Array<ReturnType<typeof scoreEvent>>) {
  const highestConfidence = scoredEvents.reduce(
    (highest, event) => Math.max(highest, event.event.confidence * event.decay),
    0
  );

  return clamp(0.35 + highestConfidence * 0.55, 0.35, 0.9);
}

function buildPriceModifiers(scoredEvents: Array<ReturnType<typeof scoreEvent>>): MarketSignalModifier[] {
  const modifiers: MarketSignalModifier[] = [];

  for (const event of scoredEvents) {
    const score = event.weightedImpact;
    const isReview = event.event.eventType === "review";
    const isRelease = event.event.eventType === "release";
    const reviewMultiplier = isReview ? clamp(1 + score / 135, 0.45, 1.35) : undefined;
    const releaseShock = isRelease ? clamp(score / 1800, -0.025, 0.04) : undefined;
    const generalShock = !isRelease && !isReview ? clamp(score / 2400, -0.025, 0.03) : undefined;
    const priceShock = releaseShock ?? generalShock;

    if (reviewMultiplier === undefined && priceShock === undefined) {
      continue;
    }

    modifiers.push({
      reason: `${event.event.eventType}: ${event.event.title}`,
      priceMultiplier: reviewMultiplier,
      priceShock,
      score
    });
  }

  return modifiers;
}

function scoreEvent(event: MarketEvent, runDate: string) {
  const ageDays = Math.max(0, daysBetween(event.eventDate, runDate));
  const decay = getEventDecay(event.eventType, ageDays);
  const typeWeight = getEventTypeWeight(event.eventType);
  const sentiment = event.sentimentScore;
  const impact = event.impactScore || sentiment;
  const weightedImpact = clamp((impact * 0.65 + sentiment * 0.35) * event.confidence * typeWeight * decay, -100, 100);

  return {
    event,
    decay,
    weightedImpact
  };
}

function normalizeOneManualEvent(
  input: ManualMarketEventInput,
  artist: MarketUpdateArtist,
  runDate: string
): MarketEvent | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const eventType = input.eventType && isMarketEventType(input.eventType) ? input.eventType : "news";
  const title = typeof input.title === "string" && input.title.trim() ? input.title.trim().slice(0, 160) : null;

  if (!title) {
    return null;
  }

  return {
    artistId: artist.id,
    eventDate: typeof input.eventDate === "string" && input.eventDate ? input.eventDate : runDate,
    eventType,
    title,
    sourceName: typeof input.sourceName === "string" ? input.sourceName.slice(0, 80) : undefined,
    sourceUrl: typeof input.sourceUrl === "string" ? input.sourceUrl.slice(0, 500) : undefined,
    sentimentScore: getFiniteNumber(input.sentimentScore, 0, -100, 100),
    impactScore: getFiniteNumber(input.impactScore, input.sentimentScore ?? 0, -100, 100),
    confidence: getFiniteNumber(input.confidence, 0.65, 0, 1),
    rawPayload: input.rawPayload ?? {
      source: "manual_event"
    }
  };
}

function getEventDecay(eventType: MarketEvent["eventType"], ageDays: number) {
  const halfLifeDays: Record<MarketEvent["eventType"], number> = {
    release: 18,
    review: 12,
    news: 7,
    controversy: 10,
    award: 14,
    tour: 16,
    viral: 5
  };

  return Math.pow(0.5, ageDays / halfLifeDays[eventType]);
}

function getEventTypeWeight(eventType: MarketEvent["eventType"]) {
  const weights: Record<MarketEvent["eventType"], number> = {
    release: 1.2,
    review: 1.35,
    news: 0.9,
    controversy: 1.15,
    award: 1.05,
    tour: 0.75,
    viral: 1.1
  };

  return weights[eventType];
}

function daysBetween(start: string, end: string) {
  const startDate = new Date(`${start}T00:00:00.000Z`).getTime();
  const endDate = new Date(`${end}T00:00:00.000Z`).getTime();

  return Math.round((endDate - startDate) / 86400000);
}

function getFiniteNumber(value: unknown, fallback: number, min: number, max: number) {
  return typeof value === "number" && Number.isFinite(value) ? clamp(value, min, max) : fallback;
}

function isMarketEventType(value: string): value is MarketEvent["eventType"] {
  return ["release", "review", "news", "controversy", "award", "tour", "viral"].includes(value);
}

function getEventKey(event: MarketEvent) {
  return `${event.artistId}:${event.eventType}:${event.eventDate}:${event.title.toLowerCase()}`;
}
