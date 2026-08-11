export function buildIntradayArtistBatch({
  pendingArtistIds,
  scannedArtistIds,
  limit
}: {
  pendingArtistIds: string[];
  scannedArtistIds: string[];
  limit: number;
}) {
  const selected: string[] = [];
  const seen = new Set<string>();

  for (const artistId of [...pendingArtistIds, ...scannedArtistIds]) {
    const normalized = artistId.trim().toLowerCase();

    if (!normalized || seen.has(normalized) || !/^[a-z0-9-]+$/.test(normalized)) {
      continue;
    }

    selected.push(normalized);
    seen.add(normalized);

    if (selected.length >= limit) {
      break;
    }
  }

  return selected;
}

export function shouldRecordIntradayPriceTick({
  currentPrice,
  comparisonPrice,
  forced
}: {
  currentPrice: number;
  comparisonPrice: number | undefined;
  forced: boolean;
}) {
  return comparisonPrice === undefined || forced || Math.abs(currentPrice - comparisonPrice) >= 0.005;
}
