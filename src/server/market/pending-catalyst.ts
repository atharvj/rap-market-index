import { getMarketDate, getMarketDayBoundsUtc } from "@/server/market/market-date";

export type PendingCatalystCandidate = {
  createdAt: string;
  eventDate: string;
  eventType: string;
};

export function isPendingCatalyst({
  event,
  quotedAt,
  now = new Date()
}: {
  event: PendingCatalystCandidate;
  quotedAt: string | null;
  now?: Date;
}) {
  const eventCreatedAt = new Date(event.createdAt).getTime();
  const quoteTimestamp = quotedAt ? new Date(quotedAt).getTime() : Number.NEGATIVE_INFINITY;

  if (!Number.isFinite(eventCreatedAt)) {
    return false;
  }

  if (eventCreatedAt > quoteTimestamp) {
    return true;
  }

  if (event.eventType !== "release" || event.eventDate !== getMarketDate(now)) {
    return false;
  }

  const marketOpenTimestamp = new Date(getMarketDayBoundsUtc(event.eventDate).start).getTime();

  return quoteTimestamp < marketOpenTimestamp;
}
