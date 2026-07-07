import type { MarketEventType } from "@/server/market/market-data";

export function buildCommunityEventTitle({
  artistName,
  eventType,
  reason,
  source
}: {
  artistName: string;
  eventType: MarketEventType | null;
  reason: string;
  source: "reddit" | "bluesky";
}) {
  const label = getCommunityEventLabel(eventType, reason);
  const sourceLabel = source === "reddit" ? "Reddit" : "social";

  return `${artistName} ${label} on ${sourceLabel}`.slice(0, 160);
}

export function getCommunityEventLabel(eventType: MarketEventType | null, reason: string) {
  const normalized = reason.toLowerCase();

  if (normalized.includes("album_announcement")) {
    return "album announcement reaction";
  }

  if (normalized.includes("artist_death")) {
    return "artist status report";
  }

  if (normalized.includes("legal_release")) {
    return "legal release reaction";
  }

  if (normalized.includes("legal_sentencing")) {
    return "legal sentencing reaction";
  }

  if (normalized.includes("legal_conviction")) {
    return "legal conviction reaction";
  }

  if (normalized.includes("legal_charge")) {
    return "legal charge reaction";
  }

  if (normalized.includes("legal_arrest") || normalized.includes("legal_incarceration")) {
    return "legal status reaction";
  }

  if (normalized.includes("hospitalization") || normalized.includes("injury")) {
    return "health status reaction";
  }

  if (normalized.includes("project_release")) {
    return "project release reaction";
  }

  if (normalized.includes("release")) {
    return "release reaction";
  }

  if (normalized.includes("tracklist")) {
    return "tracklist reaction";
  }

  if (normalized.includes("social_conflict")) {
    return "fight/beef reaction";
  }

  if (normalized.includes("late_reception_positive")) {
    return "late reception improving";
  }

  if (normalized.includes("late_reception_negative")) {
    return "late reception cooling";
  }

  if (normalized.includes("critic_reaction")) {
    return "critic and listener reaction";
  }

  if (normalized.includes("snippet")) {
    return "snippet hype";
  }

  if (normalized.includes("performance")) {
    return "performance reaction";
  }

  if (normalized.includes("feature")) {
    return "feature/cosign reaction";
  }

  if (normalized.includes("chart")) {
    return "chart momentum reaction";
  }

  if (normalized.includes("backlash") || normalized.includes("controversy")) {
    return "backlash reaction";
  }

  if (normalized.includes("decline")) {
    return "decline discussion";
  }

  if (normalized.includes("review")) {
    return "review reaction";
  }

  if (normalized.includes("viral")) {
    return "viral discussion";
  }

  if (eventType === "controversy") {
    return "backlash reaction";
  }

  if (eventType === "review") {
    return "review reaction";
  }

  if (eventType === "release") {
    return "release reaction";
  }

  return "fan discussion";
}
