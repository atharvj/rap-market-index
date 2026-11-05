export function writeJsonArray(path: string, pages: AsyncIterable<unknown[]>): Promise<{ rowCount: number; sha256: string }>;
export function readBackupPage<T>(load: () => Promise<{ data: T[] | null; error: { message: string; code?: string } | null; status?: number }>, retryDelayMs?: number): Promise<T[]>;
export function backupCursorFilter(columns: string[], row: Record<string, unknown>): string;
