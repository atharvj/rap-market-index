type ArtistIdentity = {
  id: string;
  ticker: string;
};

export function selectArtistsByOldestCoverage<T extends ArtistIdentity>({
  artists,
  latestDateMaps,
  limit
}: {
  artists: T[];
  latestDateMaps: Array<Record<string, string>>;
  limit: number;
}) {
  return [...artists]
    .sort((first, second) => {
      const firstDate = getOldestEnabledScanDate(first.id, latestDateMaps);
      const secondDate = getOldestEnabledScanDate(second.id, latestDateMaps);

      if (firstDate !== secondDate) {
        return firstDate.localeCompare(secondDate);
      }

      return first.ticker.localeCompare(second.ticker);
    })
    .slice(0, limit);
}

function getOldestEnabledScanDate(
  artistId: string,
  latestDateMaps: Array<Record<string, string>>
) {
  return latestDateMaps
    .map((latestDates) => latestDates[artistId])
    .filter((date): date is string => Boolean(date))
    .sort()[0] ?? "";
}
