import { areNewsStoryEventsEquivalent, type NewsStoryEvent } from "@/server/market/news-story-groups";

type PricedStory = NewsStoryEvent & { pricingSubtype?: string; positiveImpact: number; negativeImpact: number;
  positiveShockImpact: number; negativeShockImpact: number };
export type EventPricingHistory = { version: 1; asOfDate: string; stories: PricedStory[] };
type ScoredEvent = { event: { artistId: string; eventDate: string; eventType: string; title: string; sourceUrl?: string; rawPayload?: Record<string, unknown> };
  weightedImpact: number; shockWeightedImpact: number; eventSubtype?: string };

/** A story consumes its impact once. Weaker/repeated coverage is not another return.
 * Read the previous day's envelope for every same-day recalculation, so the latest
 * daily evidence replaces that day's calculation instead of depending on run order.
 */
export function priceNewEventEvidence<T extends ScoredEvent>(events: T[], previous: unknown, runDate: string, artistId: string) {
  const baseline = readHistory(previous, runDate, artistId);
  const stories: PricedStory[] = [];
  for (const originalStory of baseline) {
    const story = { ...originalStory };
    // Older snapshots stored generated project titles. Join them to the
    // verified article still present in this collection before changing its
    // display title, so an upgrade cannot make old coverage look new.
    const legacyMatch = events.find(item => item.event.eventDate === story.event_date &&
      (item.event.title === story.title || item.event.rawPayload?.inferredReleaseTitle === story.title));
    if (legacyMatch) {
      story.title = eventHeadline(legacyMatch.event);
      story.source_url = legacyMatch.event.sourceUrl ?? story.source_url;
    }
    const existing = stories.find(item => samePricingStory(item, story));
    if (existing) {
      existing.positiveImpact = Math.max(existing.positiveImpact, story.positiveImpact);
      existing.negativeImpact = Math.max(existing.negativeImpact, story.negativeImpact);
      existing.positiveShockImpact = Math.max(existing.positiveShockImpact, story.positiveShockImpact);
      existing.negativeShockImpact = Math.max(existing.negativeShockImpact, story.negativeShockImpact);
    } else stories.push({ ...story });
  }
  const priced = events.map(item => {
    if (!validDate(item.event.eventDate) || item.event.artistId !== artistId) throw new Error(`Invalid event pricing identity for ${artistId}.`);
    if (item.event.eventDate > runDate) return { ...item, weightedImpact: 0, shockWeightedImpact: 0,
      pricingInnovationMultiplier: 0, shockInnovationMultiplier: 0, alreadyPricedImpact: 0 };
    const story = { id: "", artist_id: artistId, event_date: item.event.eventDate,
      event_type: item.event.eventType, title: eventHeadline(item.event), source_url: item.event.sourceUrl ?? null,
      pricingSubtype: item.eventSubtype };
    let record = stories.find(existing => samePricingStory(existing, story));
    if (!record) {
      record = { ...story, positiveImpact: 0, negativeImpact: 0, positiveShockImpact: 0, negativeShockImpact: 0 };
      stories.push(record);
    }
    const direction = item.weightedImpact >= 0 ? "positiveImpact" : "negativeImpact";
    const impact = Math.abs(item.weightedImpact);
    const alreadyPricedImpact = record[direction];
    const innovation = Math.max(0, impact - alreadyPricedImpact);
    const innovationMultiplier = impact > 0 ? innovation / impact : 0;
    const shockDirection = item.shockWeightedImpact >= 0 ? "positiveShockImpact" : "negativeShockImpact";
    const shock = Math.abs(item.shockWeightedImpact);
    const shockInnovation = Math.max(0, shock - record[shockDirection]);
    const shockInnovationMultiplier = shock > 0 ? shockInnovation / shock : 0;
    record[direction] = Math.max(alreadyPricedImpact, impact);
    record[shockDirection] = Math.max(record[shockDirection], shock);
    return { ...item, weightedImpact: innovation > 0 ? item.weightedImpact * innovationMultiplier : 0,
      shockWeightedImpact: shockInnovation > 0 ? item.shockWeightedImpact * shockInnovationMultiplier : 0,
      pricingInnovationMultiplier: innovationMultiplier, shockInnovationMultiplier, alreadyPricedImpact };
  });
  return { events: priced, history: { version: 1, asOfDate: runDate, stories } satisfies EventPricingHistory };
}

function readHistory(previous: unknown, runDate: string, artistId: string): PricedStory[] {
  if (!previous || typeof previous !== "object" || Array.isArray(previous)) return [];
  const raw = previous as Record<string, unknown>;
  if (raw.pricingHistory !== undefined) {
    const history = raw.pricingHistory as EventPricingHistory;
    if (!history || history.version !== 1 || !validDate(history.asOfDate) || history.asOfDate >= runDate ||
      !Array.isArray(history.stories) || !history.stories.every(story => validStory(story, artistId) && story.event_date <= history.asOfDate)) {
      throw new Error(`Could not verify previous event pricing history for ${artistId}.`);
    }
    return history.stories.filter(story => story.event_date < runDate && dayGap(story.event_date, runDate) <= 45);
  }
  // Migrate actual previously scored evidence. Upgrading the model must not
  // replay every still-visible release/chart story as a newly discovered event.
  if (!Array.isArray(raw.events)) return [];
  return raw.events.flatMap(value => {
    if (!value || typeof value !== "object") return [];
    const event = value as Record<string, unknown>;
    if (typeof event.title !== "string" || !validDate(event.eventDate) || typeof event.eventType !== "string" ||
      typeof event.weightedImpact !== "number" || !Number.isFinite(event.weightedImpact) ||
      event.eventDate >= runDate || dayGap(event.eventDate, runDate) > 45) return [];
    return [{ id: "", artist_id: artistId, event_date: event.eventDate, event_type: event.eventType, title: event.title,
      source_url: null, pricingSubtype: typeof event.eventSubtype === "string" ? event.eventSubtype : undefined,
      positiveImpact: Math.max(0, event.weightedImpact), negativeImpact: Math.max(0, -event.weightedImpact),
      positiveShockImpact: Math.max(0, typeof event.shockWeightedImpact === "number" ? event.shockWeightedImpact : event.weightedImpact),
      negativeShockImpact: Math.max(0, -(typeof event.shockWeightedImpact === "number" ? event.shockWeightedImpact : event.weightedImpact)) }];
  });
}

function validStory(story: PricedStory, artistId: string) {
  return story && story.artist_id === artistId && typeof story.title === "string" && validDate(story.event_date) &&
    (story.source_url === null || typeof story.source_url === "string") &&
    [story.positiveImpact, story.negativeImpact, story.positiveShockImpact, story.negativeShockImpact]
      .every(value => Number.isFinite(value) && value >= 0 && value <= 1000);
}
function samePricingStory(first: NewsStoryEvent & { pricingSubtype?: string }, second: NewsStoryEvent & { pricingSubtype?: string }) {
  if (first.pricingSubtype && second.pricingSubtype && first.pricingSubtype !== second.pricingSubtype &&
    [first.pricingSubtype, second.pricingSubtype].some(type => type === "project_announcement" || type === "project_release")) return false;
  return areNewsStoryEventsEquivalent(first, second);
}
function eventHeadline(event: ScoredEvent["event"]) {
  const raw = event.rawPayload;
  return raw?.publisherArticleVerified === true && raw.publisherHeadlineVerified === true &&
    typeof raw.publisherHeadline === "string" && raw.publisherHeadline.trim() ? raw.publisherHeadline : event.title;
}
function validDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function dayGap(start: string, end: string) { return (Date.parse(end) - Date.parse(start)) / 86400000; }
