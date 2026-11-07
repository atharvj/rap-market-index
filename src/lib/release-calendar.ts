import { isMarketDate, shiftReviewDate } from "@/lib/personal-market";
const months = [
  "jan(?:uary)?",
  "feb(?:ruary)?",
  "mar(?:ch)?",
  "apr(?:il)?",
  "may",
  "jun(?:e)?",
  "jul(?:y)?",
  "aug(?:ust)?",
  "sep(?:t(?:ember)?)?",
  "oct(?:ober)?",
  "nov(?:ember)?",
  "dec(?:ember)?",
];
/** A publisher-verified date must also occur in explicit release wording, not merely elsewhere in an article. */
export function readAnnouncedReleaseDate(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (
    raw.source !== "media_rss_item" ||
    raw.publisherArticleVerified !== true ||
    raw.publisherHeadlineVerified !== true ||
    !["album", "ep", "mixtape"].includes(String(raw.releaseKind)) ||
    !isMarketDate(raw.releaseDate)
  )
    return null;
  const published =
    typeof raw.publisherPublishedDate === "string"
      ? raw.publisherPublishedDate.slice(0, 10)
      : "";
  if (
    !isMarketDate(published) ||
    raw.releaseDate < published ||
    raw.releaseDate > shiftReviewDate(published, 90)!
  )
    return null;
  const text = [raw.publisherHeadline, raw.publisherDescription]
    .filter((v) => typeof v === "string")
    .join(". ");
  if (
    /\b(?:cancel(?:led|ed|lation)?|postpon\w*|delay\w*|pushed\s+back|rumou?r\w*)\b/i.test(
      text,
    )
  )
    return null;
  const [year, month, day] = raw.releaseDate.split("-").map(Number);
  const date = `${months[month - 1]}\\.?\\s+0?${day}(?:st|nd|rd|th)?\\b(?:,?\\s+(20\\d{2}))?`;
  // Keep the project, release wording and date in one clause. A festival or tour
  // date elsewhere in an album announcement is not an album release date.
  const textWithoutMonthPeriods = text.replace(
    /\b(Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.(?=\s+\d)/gi,
    "$1",
  );
  const project = "\\b(?:album|ep|mixtape|project)\\b";
  const verb =
    "\\b(?:out|arriv(?:e|es|ing)|drops?|dropping|releases?|due|coming|scheduled|slated|set)\\b";
  const pattern = new RegExp(
    `(?:${project}[^.!?;\\n]{0,100}${verb}|${verb}[^.!?;\\n]{0,65}${project})[^.!?;\\n]{0,65}\\b${date}`,
    "gi",
  );
  for (const match of textWithoutMonthPeriods.matchAll(pattern)) {
    if (
      /\b(?:tour|festival|birthday|anniversary|concert|tickets?|performance)\b/i.test(
        match[0],
      )
    )
      continue;
    if (match[1] && Number(match[1]) !== year) continue;
    return raw.releaseDate;
  }
  return null;
}
