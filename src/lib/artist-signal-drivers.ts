import type { HypeStats } from "@/lib/types";

export type ArtistSignalDriver = {
  key: string;
  label: string;
  contribution: number;
};

export function getArtistSignalDrivers(stats: HypeStats) {
  const drivers: ArtistSignalDriver[] = [
    {
      key: "streaming",
      label: "Listening",
      contribution: stats.streamingGrowth * 0.35
    },
    {
      key: "youtube",
      label: "Video",
      contribution: stats.youtubeGrowth * 0.25
    },
    {
      key: "search",
      label: "Search",
      contribution: stats.searchGrowth * 0.075
    },
    {
      key: "social",
      label: "Fan response",
      contribution: stats.socialGrowth * 0.075
    },
    {
      key: "news",
      label: "Media",
      contribution: (stats.newsScore - 50) * 0.075
    },
    {
      key: "trading",
      label: "Trading",
      contribution: stats.traderDemand * 0.1
    }
  ];

  return drivers
    .map((driver) => ({
      ...driver,
      contribution: Math.round(driver.contribution * 100) / 100
    }))
    .sort((first, second) => Math.abs(second.contribution) - Math.abs(first.contribution));
}
