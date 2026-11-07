import type { Artist, Holding, ShortPosition } from "@/lib/types";

export function isMarketDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
export function shiftReviewDate(date: string, days: number) {
  if (!isMarketDate(date)) return null;
  const time = new Date(`${date}T00:00:00Z`);
  time.setUTCDate(time.getUTCDate() + days);
  return time.toISOString().slice(0, 10);
}
export function getTrackedArtists(
  artists: Artist[],
  watchlist: string[],
  holdings: Holding[],
  shorts: ShortPosition[],
) {
  const ids = new Set([
    ...watchlist,
    ...holdings.map((h) => h.artistId),
    ...shorts.map((s) => s.artistId),
  ]);
  return artists.filter((artist) => ids.has(artist.id));
}
export type ArtistWeek = {
  artist: Artist;
  startDate: string;
  endDate: string;
  changePercent: number;
  days: number;
};
export function getArtistWeek(
  artist: Artist,
  marketDate: string,
): ArtistWeek | null {
  if (!isMarketDate(marketDate)) return null;
  const points = [
    ...new Map(
      artist.priceHistory
        .filter(
          (p) =>
            isMarketDate(p.date) &&
            p.date <= marketDate &&
            Number.isFinite(p.price) &&
            p.price > 0,
        )
        .map((p) => [p.date, p]),
    ).values(),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const end = points.at(-1);
  if (!end) return null;
  const target = shiftReviewDate(end.date, -7)!;
  // Require a recorded start within the week. Do not turn a month-long gap into a seven-day return.
  const start = points.find((p) => p.date >= target && p.date < end.date);
  if (!start) return null;
  const days = Math.round(
    (Date.parse(end.date) - Date.parse(start.date)) / 86400000,
  );
  return {
    artist,
    startDate: start.date,
    endDate: end.date,
    days,
    changePercent: (end.price / start.price - 1) * 100,
  };
}
export function buildArtistRecap(weeks: ArtistWeek[], date: string) {
  return [
    "My RMI artist watch",
    `Recorded quote changes through ${date}`,
    ...weeks.map(
      (w) =>
        `${w.artist.name} ($${w.artist.ticker}): ${w.changePercent > 0 ? "+" : ""}${w.changePercent.toFixed(2)}% · ${w.startDate} to ${w.endDate}`,
    ),
    "Artist quote performance · fantasy market",
    "https://rap-market-index.vercel.app",
  ].join("\n");
}
