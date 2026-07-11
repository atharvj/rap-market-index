import type { Artist, HoldingView, PricePoint, ShortPositionView } from "@/lib/types";

type HistoricalAsset = Pick<Artist, "currentPrice" | "priceHistory">;

export function buildMarketIndexSeries(artists: Artist[], maxPoints = 28): PricePoint[] {
  const histories = artists
    .map((artist) => normalizeHistory(artist))
    .filter((history) => history.length > 0);

  if (!histories.length) {
    return [];
  }

  const dates = getSharedDates(histories).slice(-maxPoints);

  return dates.map((date) => {
    const normalizedQuotes = histories.flatMap((history) => {
      const base = history[0]?.price;
      const quote = getQuoteAtDate(history, date);

      return base > 0 && quote > 0 ? [(quote / base) * 100] : [];
    });

    return {
      date,
      price: average(normalizedQuotes)
    };
  });
}

export function buildPortfolioQuoteSeries({
  holdings,
  shortPositions,
  cashBalance,
  maxPoints = 28
}: {
  holdings: HoldingView[];
  shortPositions: ShortPositionView[];
  cashBalance: number;
  maxPoints?: number;
}): PricePoint[] {
  const assets = [...holdings.map((holding) => holding.artist), ...shortPositions.map((position) => position.artist)];
  const histories = assets.map((artist) => normalizeHistory(artist)).filter((history) => history.length > 0);

  if (!histories.length) {
    return [];
  }

  return getSharedDates(histories)
    .slice(-maxPoints)
    .map((date) => {
      const longValue = holdings.reduce(
        (total, holding) => total + holding.shares * getQuoteAtDate(normalizeHistory(holding.artist), date),
        0
      );
      const shortValue = shortPositions.reduce((total, position) => {
        const quote = getQuoteAtDate(normalizeHistory(position.artist), date);
        return total + position.collateral + (position.averageShortPrice - quote) * position.shares;
      }, 0);

      return {
        date,
        price: Math.max(0, cashBalance + longValue + shortValue)
      };
    });
}

export function getMarketBreadth(artists: Artist[]) {
  const advancers = artists.filter((artist) => artist.dailyChangePercent > 0.01).length;
  const decliners = artists.filter((artist) => artist.dailyChangePercent < -0.01).length;
  const unchanged = Math.max(0, artists.length - advancers - decliners);
  const averageMove = average(artists.map((artist) => artist.dailyChangePercent));
  const averageAbsoluteMove = average(artists.map((artist) => Math.abs(artist.dailyChangePercent)));

  return {
    advancers,
    decliners,
    unchanged,
    averageMove,
    averageAbsoluteMove,
    advanceDeclineRatio: decliners > 0 ? advancers / decliners : advancers
  };
}

export function getSeriesChangePercent(series: PricePoint[]) {
  const first = series[0]?.price ?? 0;
  const last = series[series.length - 1]?.price ?? first;

  return first > 0 ? ((last - first) / first) * 100 : 0;
}

function normalizeHistory(asset: HistoricalAsset): PricePoint[] {
  const byDate = new Map<string, number>();

  for (const point of asset.priceHistory) {
    if (point.date && Number.isFinite(point.price) && point.price > 0) {
      byDate.set(point.date, point.price);
    }
  }

  const history = [...byDate.entries()]
    .map(([date, price]) => ({ date, price }))
    .sort((first, second) => first.date.localeCompare(second.date));

  if (!history.length && asset.currentPrice > 0) {
    return [{ date: "current", price: asset.currentPrice }];
  }

  return history;
}

function getSharedDates(histories: PricePoint[][]) {
  return [...new Set(histories.flatMap((history) => history.map((point) => point.date)))].sort((a, b) =>
    a.localeCompare(b)
  );
}

function getQuoteAtDate(history: PricePoint[], date: string) {
  let quote = history[0]?.price ?? 0;

  for (const point of history) {
    if (point.date > date) {
      break;
    }

    quote = point.price;
  }

  return quote;
}

function average(values: number[]) {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
}
