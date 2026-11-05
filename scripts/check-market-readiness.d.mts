export function assertMarketSnapshot(data: unknown): Array<{ id: string; currentPrice: number }>;
export function assertArtistHistory(history: unknown, artist: { currentPrice: number }, marketDate: string): void;
