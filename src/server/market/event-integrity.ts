import type { MarketEvent } from "@/server/market/market-data";

type EventIdentity = {
  eventDate: string;
  title: string;
  sourceUrl?: string | null;
};

export function isMarketEventSourceIntegrityValid(event: MarketEvent) {
  const source = getString(event.rawPayload.source)?.toLowerCase();

  if (source !== "ai_research_event") {
    return true;
  }

  return hasVerifiedAiResearchArticleProvenance(event.rawPayload, {
    eventDate: event.eventDate,
    title: event.title,
    sourceUrl: event.sourceUrl
  });
}

export function hasVerifiedAiResearchArticleProvenance(
  rawPayload: Record<string, unknown>,
  event: EventIdentity
) {
  if (
    rawPayload.evidenceVersion !== 2 ||
    rawPayload.sourceUrlExactSearchMatch !== true ||
    rawPayload.publisherArticleVerified !== true ||
    rawPayload.publisherDateVerified !== true ||
    rawPayload.publisherHeadlineVerified !== true
  ) {
    return false;
  }

  const publisherDate = getString(rawPayload.publisherPublishedDate);
  const publisherHeadline = getString(rawPayload.publisherHeadline);
  const publisherCanonicalUrl = getString(rawPayload.publisherCanonicalUrl);

  if (
    !publisherDate ||
    !publisherHeadline ||
    !publisherCanonicalUrl ||
    publisherDate !== event.eventDate ||
    normalizeHeadline(publisherHeadline) !== normalizeHeadline(event.title)
  ) {
    return false;
  }

  return areEquivalentSourceUrls(publisherCanonicalUrl, event.sourceUrl);
}

function normalizeHeadline(value: string) {
  return value
    .toLowerCase()
    .replace(/&(?:amp|#0*38);/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function areEquivalentSourceUrls(first: string, second: string | null | undefined) {
  if (!second) {
    return false;
  }

  try {
    const normalize = (value: string) => {
      const url = new URL(value);
      url.hash = "";
      url.search = "";
      url.pathname = url.pathname.replace(/\/+$/, "") || "/";
      return `${url.hostname.toLowerCase().replace(/^www\./, "")}${url.pathname}`;
    };

    return normalize(first) === normalize(second);
  } catch {
    return false;
  }
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
