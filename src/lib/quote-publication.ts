import { isMarketDate } from "@/lib/personal-market";
export type QuotePublication = {
  artist_id: string;
  observed_at: string;
  observed_date: string;
  model_version?: string | null;
};
export function getQuotePublications(
  rows: QuotePublication[],
  marketDate: string,
  now = Date.now(),
) {
  const latest = new Map<string, QuotePublication>();
  if (!isMarketDate(marketDate)) return latest;
  for (const row of rows) {
    const time = Date.parse(row.observed_at);
    if (
      !isMarketDate(row.observed_date) ||
      row.observed_date > marketDate ||
      !Number.isFinite(time) ||
      time > now + 60000
    )
      continue;
    if (
      time > Date.parse(latest.get(row.artist_id)?.observed_at ?? "") ||
      !latest.has(row.artist_id)
    )
      latest.set(row.artist_id, row);
  }
  return latest;
}
