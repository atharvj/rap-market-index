export const QUOTE_STALE_AFTER_MS = 30 * 60 * 1000;
export type QuoteFreshness = { checkedAt: string; asOf: string | null; staleArtistCount: number; artistCount: number };

export function summarizeQuoteFreshness(artistIds: string[], rows: Array<{ artist_id: string; observed_at: string; observed_date: string }>, marketDate: string, now = Date.now()): QuoteFreshness {
  const latest = new Map<string, { time: number; date: string }>();
  for (const row of rows) {
    const time = Date.parse(row.observed_at);
    if (!Number.isFinite(time) || time > now + 60_000 || row.observed_date > marketDate) continue;
    if (!latest.has(row.artist_id) || latest.get(row.artist_id)!.time < time) latest.set(row.artist_id, { time, date: row.observed_date });
  }
  const ids = [...new Set(artistIds)];
  const staleArtistCount = ids.filter(id => {
    const last = latest.get(id);
    return !last || last.date !== marketDate || now - last.time >= QUOTE_STALE_AFTER_MS;
  }).length;
  return { checkedAt: new Date(now).toISOString(), artistCount: ids.length, staleArtistCount,
    asOf: ids.length && ids.every(id => latest.has(id)) ? new Date(Math.min(...ids.map(id => latest.get(id)!.time))).toISOString() : null };
}
