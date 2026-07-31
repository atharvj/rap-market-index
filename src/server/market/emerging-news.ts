import type { ArtistCategory } from "@/lib/types";

const EDITORIAL_SOURCES = new Set([
  "ai_research_event",
  "gdelt_article",
  "media_rss_item"
]);

export function isTrustedEmergingEditorialCoverage({
  category,
  source,
  sourceTier
}: {
  category: ArtistCategory | undefined;
  source: string;
  sourceTier: number;
}) {
  return (
    (category === "underground" || category === "rising") &&
    EDITORIAL_SOURCES.has(source) &&
    sourceTier >= 1
  );
}

export function promoteEmergingEditorialCoverage<T>({
  ranked,
  selected,
  isEligible,
  limit,
  promoteIndex = 6
}: {
  ranked: T[];
  selected: T[];
  isEligible: (item: T) => boolean;
  limit: number;
  promoteIndex?: number;
}) {
  if (!selected.length || selected.slice(0, promoteIndex + 1).some(isEligible)) {
    return selected;
  }

  const candidate = ranked.find(isEligible);

  if (!candidate) {
    return selected;
  }

  const promoted = selected.filter((item) => item !== candidate);
  const insertionIndex = Math.min(promoteIndex, promoted.length);
  promoted.splice(insertionIndex, 0, candidate);

  return promoted.slice(0, limit);
}
