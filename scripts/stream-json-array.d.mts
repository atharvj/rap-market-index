export function writeJsonArray(path: string, pages: AsyncIterable<unknown[]>): Promise<{ rowCount: number; sha256: string }>;
