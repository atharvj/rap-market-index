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
  const scoredEvents = applyEventClusterCaps(events.map((event) => scoreEvent(event, runDate)));
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
  const sourceConfirmedEventCount = scoredEvents.filter((event) => event.clusterSourceCount > 1).length;
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
      sourceConfirmedEventCount,
      events: scoredEvents.map((event) => ({
        title: event.event.title,
        eventType: event.event.eventType,
        eventDate: event.event.eventDate,
        sentimentScore: event.event.sentimentScore,
        impactScore: event.event.impactScore,
        confidence: event.event.confidence,
        decay: event.decay,
        eventSubtype: event.eventSubtype,
        clusterKey: event.clusterKey,
        clusterMultiplier: event.clusterMultiplier,
        clusterSourceCount: event.clusterSourceCount,
        clusterConfirmationMultiplier: event.clusterConfirmationMultiplier,
        uncappedWeightedImpact: event.uncappedWeightedImpact,
        weightedImpact: event.weightedImpact
      }))
    }
  };
}

type ScoredMarketEvent = ReturnType<typeof scoreEvent> & {
  clusterKey: string;
  clusterMultiplier: number;
  clusterSourceCount: number;
  clusterConfirmationMultiplier: number;
  eventSubtype: string;
  uncappedWeightedImpact: number;
};

function getEventSignalConfidence(scoredEvents: ScoredMarketEvent[]) {
  const highestConfidence = scoredEvents.reduce(
    (highest, event) => Math.max(highest, event.event.confidence * event.decay),
    0
  );
  const maxSourceCount = scoredEvents.reduce(
    (highest, event) => Math.max(highest, event.clusterSourceCount),
    0
  );
  const averageAbsImpact =
    scoredEvents.reduce((total, event) => total + Math.abs(event.weightedImpact), 0) /
    Math.max(1, scoredEvents.length);
  const breadthLift = clamp((maxSourceCount - 1) * 0.055, 0, 0.14);
  const impactLift = clamp(averageAbsImpact / 800, 0, 0.09);
  const eventCountLift = clamp(Math.log10(scoredEvents.length + 1) * 0.04, 0, 0.08);

  return clamp(0.32 + highestConfidence * 0.47 + breadthLift + impactLift + eventCountLift, 0.35, 0.92);
}

function buildPriceModifiers(scoredEvents: ScoredMarketEvent[]): MarketSignalModifier[] {
  const modifiers: MarketSignalModifier[] = [];

  for (const event of scoredEvents) {
    const score = event.weightedImpact;
    const isReview = event.event.eventType === "review";
    const isRelease = event.event.eventType === "release";
    const subtypeProfile = getEventSubtypePriceProfile(event.eventSubtype);
    const reviewShock = isReview ? clamp(score / 1700, -0.05, 0.045) : undefined;
    const releaseShock = isRelease ? clamp(score / 1750, -0.025, 0.045) : undefined;
    const generalShock = !isRelease && !isReview
      ? clamp(score / subtypeProfile.divisor, subtypeProfile.minShock, subtypeProfile.maxShock)
      : undefined;
    const priceShock = reviewShock ?? releaseShock ?? generalShock;

    if (priceShock === undefined) {
      continue;
    }

    modifiers.push({
      reason: `${event.event.eventType}${event.eventSubtype === event.event.eventType ? "" : `/${event.eventSubtype}`}: ${event.event.title}`,
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

function applyEventClusterCaps(scoredEvents: Array<ReturnType<typeof scoreEvent>>): ScoredMarketEvent[] {
  const groups = scoredEvents.reduce<Record<string, Array<ReturnType<typeof scoreEvent>>>>((memo, event) => {
    const sign = event.weightedImpact < 0 ? "negative" : "positive";
    const key = `${event.event.eventType}:${event.event.eventDate}:${sign}`;

    memo[key] ??= [];
    memo[key].push(event);
    return memo;
  }, {});
  const multipliers = new Map<
    ReturnType<typeof scoreEvent>,
    { key: string; multiplier: number; sourceCount: number; confirmationMultiplier: number }
  >();

  for (const [key, events] of Object.entries(groups)) {
    const eventType = events[0]?.event.eventType ?? "news";
    const cap = getEventClusterCap(eventType);
    const sourceCount = countDistinctEventSources(events);
    const confirmationMultiplier = getClusterConfirmationMultiplier(sourceCount);
    const total = events.reduce((sum, event) => sum + event.weightedImpact * confirmationMultiplier, 0);
    const multiplier = Math.abs(total) > cap ? cap / Math.abs(total) : 1;

    for (const event of events) {
      multipliers.set(event, { key, multiplier, sourceCount, confirmationMultiplier });
    }
  }

  return scoredEvents.map((event) => {
    const cluster = multipliers.get(event) ?? {
      key: "unclustered",
      multiplier: 1,
      sourceCount: 1,
      confirmationMultiplier: 1
    };
    const confirmedImpact = event.weightedImpact * cluster.confirmationMultiplier;

    return {
      ...event,
      clusterKey: cluster.key,
      clusterMultiplier: cluster.multiplier,
      clusterSourceCount: cluster.sourceCount,
      clusterConfirmationMultiplier: cluster.confirmationMultiplier,
      eventSubtype: getEventSubtype(event.event),
      uncappedWeightedImpact: event.weightedImpact,
      weightedImpact: clamp(confirmedImpact * cluster.multiplier, -100, 100)
    };
  });
}

function countDistinctEventSources(events: Array<ReturnType<typeof scoreEvent>>) {
  return new Set(
    events.map((event) => normalizeEventSource(event.event.sourceName ?? getRawString(event.event.rawPayload.source) ?? "unknown"))
  ).size;
}

function normalizeEventSource(value: string) {
  const normalized = value.toLowerCase().trim();

  if (normalized.startsWith("reddit/")) {
    return normalized;
  }

  if (normalized.includes("youtube")) {
    return "youtube";
  }

  if (normalized.includes("musicbrainz")) {
    return "musicbrainz";
  }

  if (normalized.includes("gdelt")) {
    return "gdelt";
  }

  try {
    const host = new URL(normalized).hostname.replace(/^www\./, "");
    return host || normalized;
  } catch {
    return normalized || "unknown";
  }
}

function getClusterConfirmationMultiplier(sourceCount: number) {
  if (sourceCount >= 3) {
    return 1.18;
  }

  if (sourceCount === 2) {
    return 1.1;
  }

  return 1;
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

function getEventSubtype(event: MarketEvent) {
  const rawReason =
    getRawString(event.rawPayload.classificationReason) ??
    getRawString(event.rawPayload.reason) ??
    getRawString(event.rawPayload.eventReason);
  const text = normalizeEventText(`${rawReason ?? ""} ${event.title}`);

  if (event.eventType === "review") {
    return "review";
  }

  if (event.eventType === "controversy") {
    return "controversy";
  }

  if (event.eventType === "release") {
    if (hasAnyTerm(text, ["album", "project", "mixtape", "ep", "deluxe", "tracklist"])) {
      return "project_release";
    }

    if (hasAnyTerm(text, ["official video", "music video", "visualizer", "single", "song"])) {
      return "single_video_release";
    }

    return "release";
  }

  if (event.eventType === "viral") {
    if (hasAnyTerm(text, ["feature", "featured", "featuring", "collab", "collaboration", "with drake", "with carti"])) {
      return "feature";
    }

    if (hasAnyTerm(text, ["performance", "performed", "rolling loud", "festival", "live"])) {
      return "performance";
    }

    if (hasAnyTerm(text, ["chart", "hot 100", "billboard", "streaming record", "number 1", "top 10"])) {
      return "chart";
    }

    if (hasAnyTerm(text, ["snippet", "snippets", "teaser", "preview", "unreleased", "leak", "leaked"])) {
      return "snippet";
    }

    return "viral";
  }

  if (event.eventType === "news" && hasAnyTerm(text, ["fell off", "fall off", "decline", "washed", "flop", "flopped"])) {
    return "decline";
  }

  return event.eventType;
}

function getEventSubtypePriceProfile(subtype: string) {
  const profiles: Record<string, { divisor: number; minShock: number; maxShock: number }> = {
    feature: { divisor: 1600, minShock: -0.025, maxShock: 0.048 },
    performance: { divisor: 1700, minShock: -0.026, maxShock: 0.044 },
    chart: { divisor: 1550, minShock: -0.022, maxShock: 0.05 },
    snippet: { divisor: 2350, minShock: -0.015, maxShock: 0.026 },
    viral: { divisor: 2200, minShock: -0.022, maxShock: 0.034 },
    controversy: { divisor: 1750, minShock: -0.052, maxShock: 0.018 },
    decline: { divisor: 1850, minShock: -0.045, maxShock: 0.012 },
    news: { divisor: 2500, minShock: -0.026, maxShock: 0.024 },
    award: { divisor: 2200, minShock: -0.01, maxShock: 0.03 },
    tour: { divisor: 2600, minShock: -0.01, maxShock: 0.022 }
  };

  return profiles[subtype] ?? { divisor: 2400, minShock: -0.025, maxShock: 0.03 };
}

function normalizeEventText(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasAnyTerm(value: string, terms: string[]) {
  return terms.some((term) => value.includes(term));
}

function getRawString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
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

function getEventClusterCap(eventType: MarketEvent["eventType"]) {
  const caps: Record<MarketEvent["eventType"], number> = {
    release: 120,
    review: 110,
    news: 80,
    controversy: 105,
    award: 75,
    tour: 65,
    viral: 95
  };

  return caps[eventType];
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
