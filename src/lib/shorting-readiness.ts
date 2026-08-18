import type { PricePoint } from "@/lib/types";

export const SHORTING_PLATFORM_ENABLED = false;
export const MIN_SHORTING_RECORDED_SESSIONS = 30;
export const MIN_SHORTING_HISTORY_DAYS = 28;
export const MIN_SHORTING_PRICE_CHANGES = 10;

export type ShortingReadiness = {
  enabled: boolean;
  dataReady: boolean;
  recordedSessions: number;
  requiredSessions: number;
  reason: string;
};

export function getShortingReadiness(priceHistory: PricePoint[]): ShortingReadiness {
  const sessions = Array.from(
    new Map(
      priceHistory
        .filter((point) => /^\d{4}-\d{2}-\d{2}$/.test(point.date) && Number.isFinite(point.price) && point.price > 0)
        .map((point) => [point.date, point])
    ).values()
  ).sort((first, second) => first.date.localeCompare(second.date));
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
    reason: enabled
      ? "Shorting is available for this artist."
      : "Shorting data requirement met; market-wide risk and liquidation controls are still being validated."
  };
}
