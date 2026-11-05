type QuoteRevision = { id: string; current_price: number; updated_at?: string };

export function sameQuoteRevisions(before: QuoteRevision[], after: QuoteRevision[]) {
  if (before.length !== after.length) return false;
  const revisions = new Map(after.map(row => [row.id, row]));
  return before.every(row => {
    const current = revisions.get(row.id);
    return current && Number(current.current_price) === Number(row.current_price) && current.updated_at === row.updated_at;
  });
}
