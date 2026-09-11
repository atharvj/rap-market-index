import type { PricePoint } from "@/lib/types";
import { originalPriceHistory } from "@/lib/adjusted-price-history";

export const SHORTING_PLATFORM_ENABLED = true;
export const MIN_SHORTING_RECORDED_SESSIONS = 30;
export const MIN_SHORTING_HISTORY_DAYS = 28;
export const MIN_SHORTING_PRICE_CHANGES = 10;
export const SHORTING_ACTIVITY_WINDOW_DAYS = 31;

export type ShortingReadiness = {
  enabled: boolean;
  dataReady: boolean;
  recordedSessions: number;
  requiredSessions: number;
  reason: string;
};

export function getShortingReadiness(priceHistory: PricePoint[]): ShortingReadiness {
  const allSessions = Array.from(
    new Map(
      originalPriceHistory(priceHistory)
        .filter((point) => /^\d{4}-\d{2}-\d{2}$/.test(point.date) && Number.isFinite(point.price) && point.price > 0)
        .map((point) => [point.date, point])
    ).values()
  ).sort((first, second) => first.date.localeCompare(second.date));
  const latestSessionAt = allSessions.length ? Date.parse(allSessions.at(-1)!.date) : Number.NaN;
  const activityCutoff = latestSessionAt - SHORTING_ACTIVITY_WINDOW_DAYS * 86_400_000;
  const sessions = allSessions.filter((point) => Date.parse(point.date) >= activityCutoff);
  const recordedSessions = sessions.length;
  const historySpanDays = sessions.length > 1
    ? Math.floor((Date.parse(sessions.at(-1)!.date) - Date.parse(sessions[0].date)) / 86_400_000)
    : 0;
  const changedSessions = sessions.slice(1).filter((point, index) => {
    const previous = sessions[index];
    return Math.abs(point.price - previous.price) >= 0.005;
  }).length;
  const dataReady =
    recordedSessions >= MIN_SHORTING_RECORDED_SESSIONS &&
    historySpanDays >= MIN_SHORTING_HISTORY_DAYS &&
    changedSessions >= MIN_SHORTING_PRICE_CHANGES;
  const enabled = SHORTING_PLATFORM_ENABLED && dataReady;

  if (!dataReady) {
    return {
      enabled,
      dataReady,
      recordedSessions,
      requiredSessions: MIN_SHORTING_RECORDED_SESSIONS,
      reason: `Shorting disabled until this artist has enough market data (${Math.min(recordedSessions, MIN_SHORTING_RECORDED_SESSIONS)}/${MIN_SHORTING_RECORDED_SESSIONS} recorded sessions).`
    };
  }

  return {
    enabled,
    dataReady,
    recordedSessions,
    requiredSessions: MIN_SHORTING_RECORDED_SESSIONS,
    reason: enabled ? "Short selling available." : "Short selling unavailable."
  };
}
