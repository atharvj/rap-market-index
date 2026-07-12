import type { PricePoint } from "@/lib/types";

const PRICE_SCALE = 100;

export type TimestampedPriceTick = PricePoint & {
  source?: string;
  marketDate?: string;
};

export function keepLatestMarketRunPerDate(ticks: TimestampedPriceTick[]) {
  const latestMarketRunIndex = new Map<string, number>();

  ticks.forEach((tick, index) => {
    if (tick.source === "market_run" && tick.marketDate) {
      latestMarketRunIndex.set(tick.marketDate, index);
    }
  });

  return ticks
    .filter((tick, index) => {
      if (tick.source !== "market_run" || !tick.marketDate) {
        return true;
      }

      return latestMarketRunIndex.get(tick.marketDate) === index;
    })
    .map(({ date, price }) => ({ date, price }));
}

export function buildIntradayPriceSeries({
  ticks,
  currentPrice,
  now = new Date().toISOString()
}: {
  ticks: PricePoint[];
  currentPrice: number;
  now?: string;
}) {
  const points = sanitizeTimestampedPoints([
    ...ticks,
    ...(isValidPrice(currentPrice) ? [{ date: now, price: currentPrice }] : [])
  ]);
  const runs: Array<{ start: PricePoint; end: PricePoint }> = [];

  for (const point of points) {
    const currentRun = runs[runs.length - 1];

    if (currentRun && pricesMatch(currentRun.end.price, point.price)) {
      currentRun.end = point;
    } else {
      runs.push({ start: point, end: point });
    }
  }

  return runs.flatMap((run) => run.start.date === run.end.date ? [run.start] : [run.start, run.end]);
}

export function buildDailyPriceSeries({
  dailyHistory,
  currentPrice,
  marketDate
}: {
  dailyHistory: PricePoint[];
  currentPrice: number;
  marketDate: string;
}) {
  const byDate = new Map<string, PricePoint>();

  for (const point of dailyHistory) {
    if (!isValidPrice(point.price)) {
      continue;
    }

    const date = normalizeMarketDate(point.date);

    if (date) {
      byDate.set(date, { date, price: point.price });
    }
  }

  if (isValidPrice(currentPrice) && normalizeMarketDate(marketDate)) {
    byDate.set(marketDate, { date: marketDate, price: currentPrice });
  }

  return [...byDate.values()].sort((first, second) => first.date.localeCompare(second.date));
}

export function hasPriceMovement(points: PricePoint[]) {
  return new Set(points.filter((point) => isValidPrice(point.price)).map((point) => toPriceUnits(point.price))).size > 1;
}

function sanitizeTimestampedPoints(points: PricePoint[]) {
  const byTimestamp = new Map<number, PricePoint>();

  for (const point of points) {
    const timestamp = new Date(point.date).getTime();

    if (!Number.isFinite(timestamp) || !isValidPrice(point.price)) {
      continue;
    }

    byTimestamp.set(timestamp, point);
  }

  return [...byTimestamp.entries()]
    .sort(([first], [second]) => first - second)
    .map(([, point]) => point);
}

function normalizeMarketDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function pricesMatch(first: number, second: number) {
  return toPriceUnits(first) === toPriceUnits(second);
}

function toPriceUnits(value: number) {
  return Math.round(value * PRICE_SCALE);
}

function isValidPrice(value: number) {
  return Number.isFinite(value) && value > 0;
}
