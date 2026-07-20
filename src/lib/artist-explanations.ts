import type { HypeStats } from "@/lib/types";

export const MARKET_SCORE_EXPLANATION =
  "RMI Score is a 1-99 measure of current signal strength across audience momentum, public attention, verified catalysts, reception, and eligible trading demand. A score near 50 is neutral or mixed, below 40 is weakening, and above 60 is strengthening. It is not a price target, forecast, or daily return.";

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
    hasVerifiedCatalyst
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
      ? "moved higher"
      : dailyChangePercent < 0
        ? "moved lower"
        : "held unchanged"
    : "moved";
  const magnitude = hasChange && Math.abs(dailyChangePercent) >= 0.005
    ? ` by ${Math.abs(dailyChangePercent).toFixed(2)}%`
    : "";

  return `${ticker} ${direction}${magnitude} at the latest recorded close.`;
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
  hasVerifiedCatalyst: boolean
) {
  if (!stats) {
    return explanation;
  }

  const hasChange = typeof dailyChangePercent === "number" && Number.isFinite(dailyChangePercent);
  const moveDirection = hasChange ? Math.sign(dailyChangePercent) : 0;
  const inputs = getMovementInputs(stats)
    .filter((input) => Math.abs(input.adjustedValue) >= input.minimumMaterialValue);
  const alignedInputs = moveDirection === 0
    ? []
    : inputs
      .filter((input) => Math.sign(input.adjustedValue) === moveDirection)
      .sort((first, second) => second.rankValue - first.rankValue);
  const counterInputs = moveDirection === 0
    ? []
    : inputs
      .filter((input) => Math.sign(input.adjustedValue) === -moveDirection)
      .sort((first, second) => second.rankValue - first.rankValue);
  const sentences = [explanation];

  const alreadyStatesNoCatalyst = CURRENT_NO_CATALYST_TERMS.some((term) =>
    explanation.toLowerCase().includes(term)
  );

  if (!hasVerifiedCatalyst && !alreadyStatesNoCatalyst) {
    sentences.push("No verified headline or event was strong enough to attribute as the primary cause.");
  }

  if (moveDirection === 0) {
    const selected = inputs
      .sort((first, second) => second.rankValue - first.rankValue)
      .slice(0, 2);

    if (selected.length) {
      sentences.push(
        `Recorded movement inputs included ${formatInputList(selected)}, but the quote closed unchanged.`
      );
    } else {
      sentences.push("No measured movement input materially separated from neutral in this run.");
    }
  } else if (alignedInputs.length) {
    sentences.push(
      `Movement evidence aligned with the quote: ${formatInputList(alignedInputs.slice(0, 2))}.`
    );
  } else {
    sentences.push("No measured movement input clearly aligned with the quote direction.");
  }

  if (counterInputs.length) {
    sentences.push(`Counter-signal: ${formatInput(counterInputs[0])} opposed the move.`);
  }

  sentences.push(`Background context: verified media and review tone was ${formatMediaTone(stats.newsScore)}.`);
  sentences.push(getConfidenceSentence({
    alignedInputCount: alignedInputs.length,
    explanation,
    hasVerifiedCatalyst,
    hasCounterSignal: counterInputs.length > 0,
    moveDirection
  }));

  return sentences.join(" ");
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

function formatInput(input: MovementInput) {
  return `${input.label} (${input.adjustedValue >= 0 ? "+" : ""}${input.adjustedValue.toFixed(2)}%)`;
}

function formatInputList(inputs: MovementInput[]) {
  const formatted = inputs.map(formatInput);
  if (formatted.length < 2) {
    return formatted[0] ?? "none";
  }
  return `${formatted[0]} and ${formatted[1]}`;
}

function formatMediaTone(newsScore: number) {
  const roundedScore = Math.round(newsScore);
  const tone = roundedScore >= 60
    ? "positive"
    : roundedScore <= 40
      ? "negative"
      : "mixed";

  return `${tone} at ${roundedScore}/100`;
}

function getConfidenceSentence({
  alignedInputCount,
  explanation,
  hasVerifiedCatalyst,
  hasCounterSignal,
  moveDirection
}: {
  alignedInputCount: number;
  explanation: string;
  hasVerifiedCatalyst: boolean;
  hasCounterSignal: boolean;
  moveDirection: number;
}) {
  const normalized = explanation.toLowerCase();

  if (!hasVerifiedCatalyst) {
    return "Evidence confidence is limited because no single verified catalyst led the move.";
  }

  if (normalized.includes("limited outside confirmation")) {
    return "Evidence confidence is limited because the catalyst had only one confirmed source.";
  }

  if (normalized.includes("broader reaction stayed mixed") || hasCounterSignal) {
    return "Evidence confidence is moderate because verified evidence was present, but recorded signals conflicted.";
  }

  if (moveDirection === 0) {
    return "Evidence confidence is moderate: a verified catalyst was recorded, but the quote closed unchanged.";
  }

  if (alignedInputCount >= 1) {
    return "Evidence confidence is moderate because a verified catalyst and measured movement evidence aligned.";
  }

  return "Evidence confidence is moderate because a verified catalyst was recorded without confirming movement in the measured inputs.";
}

function describesPositiveMove(value: string) {
  return ["moved higher", "rose", "rises", "gained", "advanced", "climbed"].some((term) => value.includes(term));
}

function describesNegativeMove(value: string) {
  return ["moved lower", "pulled back", "fell", "falls", "declined", "dropped", "under pressure"].some((term) => value.includes(term));
}
