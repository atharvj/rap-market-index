import type { HypeStats } from "@/lib/types";
import { PRICE_SIGNAL_WEIGHTS } from "@/lib/pricing";

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
      contribution: stats.streamingGrowth * PRICE_SIGNAL_WEIGHTS.listening
    },
    {
      key: "youtube",
      label: "Video",
      contribution: stats.youtubeGrowth * PRICE_SIGNAL_WEIGHTS.video
    },
    {
      key: "search",
      label: "Search",
      contribution: stats.searchGrowth * PRICE_SIGNAL_WEIGHTS.search
    },
    {
      key: "social",
      label: "Fan response",
      contribution: stats.socialGrowth * PRICE_SIGNAL_WEIGHTS.fanResponse
    },
    {
      key: "news",
      label: "Media",
      contribution: (stats.newsScore - 50) * PRICE_SIGNAL_WEIGHTS.media
    },
    {
      key: "trading",
      label: "Trading",
      contribution: stats.traderDemand * PRICE_SIGNAL_WEIGHTS.trading
    }
  ];

  return drivers
    .map((driver) => ({
      ...driver,
      contribution: Math.round(driver.contribution * 100) / 100
    }))
    .sort((first, second) => Math.abs(second.contribution) - Math.abs(first.contribution));
}
