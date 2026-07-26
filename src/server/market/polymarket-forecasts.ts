import { clamp } from "@/lib/pricing";
import type {
  MarketForecast,
  MarketForecastDirection,
  MarketForecastKind
} from "@/lib/types";

const MIN_TRACKED_LIQUIDITY = 100;
const MIN_TRACKED_VOLUME = 500;
const MAX_TRACKED_SPREAD = 0.35;

export function buildPublicMarketForecasts({
  artistId,
  observedDate,
  rawPayload,
  limit = 12
}: {
  artistId: string;
  observedDate: string;
  rawPayload: Record<string, unknown>;
  limit?: number;
}): MarketForecast[] {
  if (!Array.isArray(rawPayload.contracts)) {
    return [];
  }

  return rawPayload.contracts
    .map((value) => parseForecast({ artistId, observedDate, value }))
    .filter((value): value is MarketForecast => Boolean(value))
    .sort((first, second) => second.insightScore - first.insightScore)
    .slice(0, clamp(Math.trunc(limit), 1, 20));
}

function parseForecast({
  artistId,
  observedDate,
  value
}: {
  artistId: string;
  observedDate: string;
  value: unknown;
}): MarketForecast | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const contract = value as Record<string, unknown>;
  const id = getString(contract.marketId);
  const question = getString(contract.question);
  const probability = getNumber(contract.probability);
  const liquidity = getNumber(contract.liquidity) ?? 0;
  const volume = getNumber(contract.volume) ?? 0;
  const spread = getNumber(contract.spread) ?? 1;
  const tracked =
    getBoolean(contract.tracked) ??
    (
      liquidity >= MIN_TRACKED_LIQUIDITY &&
      volume >= MIN_TRACKED_VOLUME &&
      spread <= MAX_TRACKED_SPREAD &&
      typeof probability === "number" &&
      probability > 0.005 &&
      probability < 0.995
    );

  if (!id || !question || typeof probability !== "number" || !tracked) {
    return null;
  }

  const direction = getDirection(contract.direction, question);
  const kind = getKind(contract.forecastKind, `${getString(contract.eventTitle) ?? ""} ${question}`);
  const qualityScore = getNumber(contract.qualityScore) ?? getFallbackQuality({ liquidity, volume, spread });
  const importanceWeight = getNumber(contract.importanceWeight) ?? getImportance(kind);
  const dailyChange = getNumber(contract.oneDayPriceChange);
  const artistOutlookProbability =
    getNumber(contract.artistOutlookProbability) ??
    (direction === "bearish_yes" ? 1 - probability : probability);
  const artistOutlookChange =
    getNumber(contract.artistOutlookChange) ??
    (
      typeof dailyChange === "number"
        ? dailyChange * (direction === "bearish_yes" ? -1 : direction === "bullish_yes" ? 1 : 0)
        : null
    );
  const isNew = getBoolean(contract.isNew) ?? false;
  const movementLift =
    typeof artistOutlookChange === "number"
      ? Math.min(0.22, Math.abs(artistOutlookChange) * 2)
      : 0;
  const insightScore = clamp(
    qualityScore * importanceWeight + movementLift + (isNew ? 0.08 : 0),
    0,
    1.4
  );

  return {
    id,
    artistId,
    question,
    eventTitle: getString(contract.eventTitle) ?? question,
    probabilityPercent: round(probability * 100),
    artistOutlookPercent: round(artistOutlookProbability * 100),
    dailyChangePoints:
      typeof dailyChange === "number" ? round(dailyChange * 100) : null,
    artistOutlookChangePoints:
      typeof artistOutlookChange === "number" ? round(artistOutlookChange * 100) : null,
    kind,
    direction,
    endDate: getString(contract.endDate),
    isNew,
    pricingEligible: getBoolean(contract.signalEligible) ?? false,
    marketQuality: qualityScore >= 0.62 ? "established" : "developing",
    asOf: observedDate,
    insightScore
  };
}

function getDirection(value: unknown, question: string): MarketForecastDirection {
  if (value === "bullish_yes" || value === "bearish_yes" || value === "informational") {
    return value;
  }

  if (/\b(not release|won't release|will not release|no new|flop|delay|cancel|fail to)\b/i.test(question)) {
    return "bearish_yes";
  }

  return "bullish_yes";
}

function getKind(value: unknown, text: string): MarketForecastKind {
  if (
    value === "release" ||
    value === "chart" ||
    value === "award" ||
    value === "streaming" ||
    value === "sales" ||
    value === "collaboration" ||
    value === "tour" ||
    value === "other"
  ) {
    return value;
  }

  if (/\b(grammy|award|album of the year|song of the year|record of the year)\b/i.test(text)) {
    return "award";
  }

  if (/#\s*1\b|\b(billboard|hot 100|number one|top album|top song|chart)\b/i.test(text)) {
    return "chart";
  }

  if (/\b(first[- ]week sales|album sales|sales)\b/i.test(text)) {
    return "sales";
  }

  if (/\b(spotify|stream(?:s|ed|ing)?|monthly listeners|top artist|most listened)\b/i.test(text)) {
    return "streaming";
  }

  if (/\b(collab|collaboration|feature|joint album)\b/i.test(text)) {
    return "collaboration";
  }

  if (/\b(tour|concert|festival|headline|headliner)\b/i.test(text)) {
    return "tour";
  }

  if (/\b(release|drop|album|song|single|track|mixtape|ep|music video)\b/i.test(text)) {
    return "release";
  }

  return "other";
}

function getImportance(kind: MarketForecastKind) {
  const values: Record<MarketForecastKind, number> = {
    release: 0.62,
    chart: 0.92,
    award: 0.86,
    streaming: 0.78,
    sales: 0.82,
    collaboration: 0.46,
    tour: 0.52,
    other: 0.3
  };

  return values[kind];
}

function getFallbackQuality({
  liquidity,
  volume,
  spread
}: {
  liquidity: number;
  volume: number;
  spread: number;
}) {
  return clamp(
    Math.log10(liquidity + 1) / 5 * 0.38 +
      Math.log10(volume + 1) / 7 * 0.37 +
      clamp(1 - spread / MAX_TRACKED_SPREAD, 0, 1) * 0.25,
    0,
    1
  );
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function getBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
