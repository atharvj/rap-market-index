export const MARKET_SCORE_EXPLANATION =
  "RMI Score is a normalized 1-99 measure of current signal strength across audience momentum, public attention, verified catalysts, reception, and eligible trading demand. It is not a price target, forecast, or daily return.";

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
  dailyChangePercent?: number
) {
  const trimmed = explanation?.trim();
  const hasChange = typeof dailyChangePercent === "number" && Number.isFinite(dailyChangePercent);

  if (hasChange && Math.abs(dailyChangePercent) < 0.005) {
    return `${ticker} held unchanged at the latest market close.`;
  }

  if (!trimmed) {
    return getFallbackMoveExplanation(ticker, dailyChangePercent);
  }

  const normalized = trimmed.toLowerCase();

  if (LOW_SIGNAL_EXPLANATION_TERMS.some((term) => normalized.includes(term))) {
    return getFallbackMoveExplanation(ticker, dailyChangePercent);
  }

  if (
    hasChange &&
    ((dailyChangePercent > 0 && describesNegativeMove(normalized)) ||
      (dailyChangePercent < 0 && describesPositiveMove(normalized)))
  ) {
    return getFallbackMoveExplanation(ticker, dailyChangePercent);
  }

  return trimmed;
}

function getFallbackMoveExplanation(ticker: string, dailyChangePercent?: number) {
  const direction = typeof dailyChangePercent === "number" && Number.isFinite(dailyChangePercent)
    ? dailyChangePercent > 0
      ? "moved higher"
      : dailyChangePercent < 0
        ? "moved lower"
        : "held unchanged"
    : "moved";

  return `${ticker} ${direction} with the latest market signal mix across audience momentum, public attention, release activity, and eligible trading demand.`;
}

function describesPositiveMove(value: string) {
  return ["moved higher", "rose", "rises", "gained", "advanced", "climbed"].some((term) => value.includes(term));
}

function describesNegativeMove(value: string) {
  return ["moved lower", "fell", "falls", "declined", "dropped", "under pressure"].some((term) => value.includes(term));
}
