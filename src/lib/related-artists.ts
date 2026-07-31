import type { Artist, ArtistCategory, HypeStats } from "@/lib/types";

const categoryOrder: Record<ArtistCategory, number> = {
  superstar: 0,
  mainstream: 1,
  rising: 2,
  underground: 3
};

const signalKeys: Array<keyof HypeStats> = [
  "streamingGrowth",
  "youtubeGrowth",
  "searchGrowth",
  "socialGrowth",
  "newsScore",
  "traderDemand"
];

export function getRelatedArtists(
  artist: Artist,
  roster: Artist[],
  limit = 4
) {
  return roster
    .filter((candidate) => candidate.id !== artist.id)
    .map((candidate) => ({
      artist: candidate,
      distance: getMarketProfileDistance(artist, candidate)
    }))
    .sort((first, second) =>
      first.distance - second.distance || first.artist.name.localeCompare(second.artist.name)
    )
    .slice(0, Math.max(0, limit))
    .map((candidate) => candidate.artist);
}

function getMarketProfileDistance(artist: Artist, candidate: Artist) {
  const categoryDistance = Math.abs(categoryOrder[artist.category] - categoryOrder[candidate.category]);
  const quoteDistance = Math.abs(Math.log(
    Math.max(0.01, candidate.currentPrice) / Math.max(0.01, artist.currentPrice)
  ));
  const signalDistance = signalKeys.reduce(
    (total, key) => total + Math.abs(artist.stats[key] - candidate.stats[key]) / 100,
    0
  ) / signalKeys.length;
  const scoreDistance = Math.abs(artist.hypeScore - candidate.hypeScore) / 100;
  const volatilityDistance = Math.abs(artist.volatility - candidate.volatility) / 2.5;
  const moveDistance = Math.min(1, Math.abs(artist.dailyChangePercent - candidate.dailyChangePercent) / 10);

  return (
    categoryDistance * 1.8 +
    quoteDistance * 1.2 +
    signalDistance * 1.5 +
    scoreDistance * 0.8 +
    volatilityDistance * 0.6 +
    moveDistance * 0.4
  );
}
