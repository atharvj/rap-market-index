import type { HypeStats } from "@/lib/types";

export const MARKET_SCORE_EXPLANATION =
  "RMI Score runs from 1-99. Around 50 means neutral or limited evidence; unusually strong or weak signals can move it toward either extreme. It is not a price forecast.";

const LOW_SIGNAL_EXPLANATION_TERMS = [
  "#explorepage",
  "explore page",
  "#fyp",
  "#shorts",
  "#reels",
  "#viral",
  "who tf is we",
  "deserves to be on the radio",
  "reaction on social",
  "fan reaction",
  "meme",
  "interlude (official audio)"
];

const LEGACY_NO_CATALYST_TERMS = [
  "on baseline market data without a source-backed headline catalyst",
  "without a source-backed headline catalyst strong enough to lead the move"
];

const CURRENT_NO_CATALYST_TERMS = [
  "no verified headline or event was strong enough",
  "no verified primary cause",
  "without a fresh confirming signal",
  "without a confirmed momentum signal",
  "no confirmed daily momentum signal"
];

const EVIDENCE_MARKER = "evidence confidence is";
const LEGACY_EVIDENCE_MARKER = "supporting recorded inputs:";

export function sanitizeMoveExplanation(
  ticker: string,
  explanation: string | null | undefined,
  dailyChangePercent?: number,
  stats?: HypeStats
) {
  const trimmed = explanation?.trim();
  const hasChange = typeof dailyChangePercent === "number" && Number.isFinite(dailyChangePercent);

  if (trimmed?.toLowerCase().includes(EVIDENCE_MARKER)) {
    return trimmed;
  }

  const baseExplanation = stripLegacyEvidence(trimmed);
  const normalized = baseExplanation.toLowerCase();
  const isUnchanged = hasChange && Math.abs(dailyChangePercent) < 0.005;
  const hasLowSignalClaim = LOW_SIGNAL_EXPLANATION_TERMS.some((term) => normalized.includes(term));
  const hasLegacyNoCatalystClaim = LEGACY_NO_CATALYST_TERMS.some((term) => normalized.includes(term));
  const hasCurrentNoCatalystClaim = CURRENT_NO_CATALYST_TERMS.some((term) => normalized.includes(term));
  const contradictsQuote = hasChange && (
    (dailyChangePercent > 0 && describesNegativeMove(normalized)) ||
    (dailyChangePercent < 0 && describesPositiveMove(normalized)) ||
    (isUnchanged && (describesPositiveMove(normalized) || describesNegativeMove(normalized)))
  );
  const shouldUseFallback = !baseExplanation || hasLowSignalClaim ||
    hasLegacyNoCatalystClaim || contradictsQuote;
  const resolvedExplanation = shouldUseFallback
    ? isUnchanged
      ? `${ticker} held unchanged at the latest market close.`
      : getFallbackMoveExplanation(ticker, dailyChangePercent)
    : baseExplanation;
  const hasVerifiedCatalyst = !shouldUseFallback &&
    !hasCurrentNoCatalystClaim &&
    hasVerifiedCatalystEvidence(normalized);

  return appendEvidenceSummary(
    resolvedExplanation,
    stats,
    dailyChangePercent,
    hasVerifiedCatalyst,
    !shouldUseFallback && !hasCurrentNoCatalystClaim
  );
}

function hasVerifiedCatalystEvidence(explanation: string) {
  return [
    "became the main market catalyst",
    "was balanced by broader market signals",
    "offset part of the move"
  ].some((term) => explanation.includes(term));
}

function stripLegacyEvidence(explanation: string | undefined) {
  if (!explanation) {
    return "";
  }

  const markerIndex = explanation.toLowerCase().indexOf(LEGACY_EVIDENCE_MARKER);
  if (markerIndex < 0) {
    return explanation;
  }

  return explanation.slice(0, markerIndex).trim().replace(/[;,:\s]+$/, "");
}

function getFallbackMoveExplanation(ticker: string, dailyChangePercent?: number) {
  const hasChange = typeof dailyChangePercent === "number" && Number.isFinite(dailyChangePercent);
  const direction = hasChange
    ? dailyChangePercent > 0
      ? "rose"
      : dailyChangePercent < 0
        ? "fell"
        : "was unchanged"
    : "moved";

  return `${ticker} ${direction} at the latest recorded close.`;
}

type MovementInput = {
  adjustedValue: number;
  label: string;
  minimumMaterialValue: number;
  rankValue: number;
};

function appendEvidenceSummary(
  explanation: string,
  stats: HypeStats | undefined,
  dailyChangePercent: number | undefined,
  hasVerifiedCatalyst: boolean,
  preserveRecordedAttribution: boolean
) {
  const compactExplanation = explanation
    .replace(/ became the main market catalyst, with limited outside confirmation\.?/gi, " led the move.")
    .replace(/ became the main market catalyst\.?/gi, " led the move.")
    .replace(/\s+/g, " ")
    .trim();

  if (hasVerifiedCatalyst || !stats) {
    return compactExplanation;
  }

  if (preserveRecordedAttribution) {
    return `${compactExplanation} No major verified story led the move.`;
  }

  const hasChange = typeof dailyChangePercent === "number" && Number.isFinite(dailyChangePercent);
  const moveDirection = hasChange ? Math.sign(dailyChangePercent) : 0;

  if (moveDirection === 0) {
    return `${compactExplanation} No major verified story changed the outlook.`;
  }

  const strongestAlignedInput = getMovementInputs(stats)
    .filter((input) => Math.abs(input.adjustedValue) >= input.minimumMaterialValue)
    .filter((input) => Math.sign(input.adjustedValue) === moveDirection)
    .sort((first, second) => second.rankValue - first.rankValue)[0];

  if (!strongestAlignedInput) {
    return `${compactExplanation} No single verified event or measured signal clearly led the move.`;
  }

  const direction = moveDirection > 0 ? "rose" : "fell";
  const signalDirection = moveDirection > 0 ? "strengthened" : "weakened";
  return `${extractTicker(compactExplanation, explanation)} ${direction} as ${getPublicSignalLabel(strongestAlignedInput.label)} ${signalDirection}. No major verified story led the move.`;
}

function extractTicker(compactExplanation: string, fallback: string) {
  return compactExplanation.split(/\s+/)[0] || fallback.split(/\s+/)[0] || "The quote";
}

function getPublicSignalLabel(label: string) {
  const labels: Record<string, string> = {
    "audience momentum": "audience activity",
    "video momentum": "video activity",
    "public attention": "public interest",
    "fan reception": "fan response",
    "eligible trading demand": "eligible trading activity"
  };

  return labels[label] ?? label;
}

function getMovementInputs(stats: HypeStats): MovementInput[] {
  return [
    createMovementInput("audience momentum", stats.streamingGrowth, 0.35, 0.25),
    createMovementInput("video momentum", stats.youtubeGrowth, 0.25, 0.25),
    createMovementInput("public attention", stats.searchGrowth, 0.075, 0.25),
    createMovementInput("fan reception", stats.socialGrowth, 0.075, 0.25),
    createMovementInput("eligible trading demand", stats.traderDemand, 0.1, 0.1)
  ];
}

function createMovementInput(
  label: string,
  value: number,
  weight: number,
  minimumMaterialValue: number
): MovementInput {
  return {
    adjustedValue: value,
    label,
    minimumMaterialValue,
    rankValue: Math.abs(value) * weight
  };
}

function describesPositiveMove(value: string) {
  return ["moved higher", "rose", "rises", "gained", "advanced", "climbed"].some((term) => value.includes(term));
}

function describesNegativeMove(value: string) {
  return ["moved lower", "pulled back", "fell", "falls", "declined", "dropped", "under pressure"].some((term) => value.includes(term));
}
