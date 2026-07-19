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

export function sanitizeMoveExplanation(
  ticker: string,
  explanation: string | null | undefined,
  dailyChangePercent?: number,
  stats?: HypeStats
) {
  const trimmed = explanation?.trim();
  const hasChange = typeof dailyChangePercent === "number" && Number.isFinite(dailyChangePercent);

  if (hasChange && Math.abs(dailyChangePercent) < 0.005) {
    const unchanged = `${ticker} held unchanged at the latest market close.`;
    return stats ? appendRecordedInputs(unchanged, stats, 0) : unchanged;
  }

  if (!trimmed) {
    return appendRecordedInputs(getFallbackMoveExplanation(ticker, dailyChangePercent), stats, dailyChangePercent);
  }

  const normalized = trimmed.toLowerCase();

  if (normalized.includes("supporting recorded inputs:")) {
    return trimmed;
  }

  if (LOW_SIGNAL_EXPLANATION_TERMS.some((term) => normalized.includes(term))) {
    return appendRecordedInputs(getFallbackMoveExplanation(ticker, dailyChangePercent), stats, dailyChangePercent);
  }

  if (
    hasChange &&
    ((dailyChangePercent > 0 && describesNegativeMove(normalized)) ||
      (dailyChangePercent < 0 && describesPositiveMove(normalized)))
  ) {
    return appendRecordedInputs(getFallbackMoveExplanation(ticker, dailyChangePercent), stats, dailyChangePercent);
  }

  return appendRecordedInputs(trimmed, stats, dailyChangePercent);
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

type RecordedInput = {
  adjustedValue: number;
  label: string;
  rankValue: number;
  value: string;
};

function appendRecordedInputs(
  explanation: string,
  stats: HypeStats | undefined,
  dailyChangePercent?: number
) {
  if (!stats) {
    return explanation;
  }

  const inputs = getRecordedInputs(stats).filter((input) => Math.abs(input.adjustedValue) >= 0.01);
  if (!inputs.length) {
    return `${explanation} No individual recorded input materially separated from neutral in this run.`;
  }

  const moveDirection = typeof dailyChangePercent === "number" && Number.isFinite(dailyChangePercent)
    ? Math.sign(dailyChangePercent)
    : 0;
  const supportive = moveDirection === 0
    ? []
    : inputs.filter((input) => Math.sign(input.adjustedValue) === moveDirection);
  const selected = (supportive.length ? supportive : inputs)
    .sort((first, second) => second.rankValue - first.rankValue)
    .slice(0, 2);
  const inputSummary = formatInputList(selected);
  const qualifier = supportive.length
    ? "Supporting recorded inputs"
    : "The largest recorded inputs were mixed; supporting recorded inputs";

  return `${explanation} ${qualifier}: ${inputSummary}.`;
}

function getRecordedInputs(stats: HypeStats): RecordedInput[] {
  return [
    createPercentInput("audience momentum", stats.streamingGrowth, 0.35),
    createPercentInput("video momentum", stats.youtubeGrowth, 0.25),
    createPercentInput("public attention", stats.searchGrowth, 0.075),
    createPercentInput("fan reception", stats.socialGrowth, 0.075),
    {
      adjustedValue: stats.newsScore - 50,
      label: "verified media/review score",
      // Daily quote movement halves the media/review deviation before weighting it.
      rankValue: Math.abs(stats.newsScore - 50) * 0.075,
      value: `${Math.round(stats.newsScore)}/100`
    },
    createPercentInput("eligible trading demand", stats.traderDemand, 0.1)
  ];
}

function createPercentInput(label: string, value: number, weight: number): RecordedInput {
  return {
    adjustedValue: value,
    label,
    rankValue: Math.abs(value) * weight,
    value: `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`
  };
}

function formatInputList(inputs: RecordedInput[]) {
  const formatted = inputs.map((input) => `${input.label} (${input.value})`);
  if (formatted.length < 2) {
    return formatted[0] ?? "none";
  }
  return `${formatted[0]} and ${formatted[1]}`;
}

function describesPositiveMove(value: string) {
  return ["moved higher", "rose", "rises", "gained", "advanced", "climbed"].some((term) => value.includes(term));
}

function describesNegativeMove(value: string) {
  return ["moved lower", "fell", "falls", "declined", "dropped", "under pressure"].some((term) => value.includes(term));
}
