export const MARKET_SCORE_EXPLANATION =
  "RMI Score is a 1-99 market signal built from audience momentum, video activity, public attention, releases, reviews, and trading demand.";

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

export function sanitizeMoveExplanation(ticker: string, explanation: string | null | undefined) {
  const trimmed = explanation?.trim();

  if (!trimmed) {
    return getFallbackMoveExplanation(ticker);
  }

  const normalized = trimmed.toLowerCase();

  if (LOW_SIGNAL_EXPLANATION_TERMS.some((term) => normalized.includes(term))) {
    return getFallbackMoveExplanation(ticker);
  }

  return trimmed;
}

function getFallbackMoveExplanation(ticker: string) {
  return `${ticker} moved as audience momentum, release activity, public attention, and trading demand shifted.`;
}
