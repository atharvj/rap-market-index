type PageLoader<T> = (from: number, to: number) => Promise<T[]>;

export async function loadAllPages<T>(
  loadPage: PageLoader<T>,
  { pageSize = 1000, maxPages = 100 }: { pageSize?: number; maxPages?: number } = {}
) {
  if (!Number.isInteger(pageSize) || pageSize < 1 || !Number.isInteger(maxPages) || maxPages < 1) {
    throw new Error("Pagination limits must be positive integers.");
  }

  const rows: T[] = [];

  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    const from = pageIndex * pageSize;
    const page = await loadPage(from, from + pageSize - 1);
    rows.push(...page);

    if (page.length < pageSize) {
      return rows;
    }
  }

  throw new Error(`Paginated query exceeded ${maxPages * pageSize} rows.`);
}
