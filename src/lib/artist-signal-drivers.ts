import type { HypeStats } from "@/lib/types";
import { SCORE_SIGNAL_MULTIPLIER, SCORE_SIGNAL_WEIGHTS } from "@/lib/pricing";

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
      contribution: stats.streamingGrowth * SCORE_SIGNAL_WEIGHTS.listening * SCORE_SIGNAL_MULTIPLIER
    },
    {
      key: "youtube",
      label: "Video",
      contribution: stats.youtubeGrowth * SCORE_SIGNAL_WEIGHTS.video * SCORE_SIGNAL_MULTIPLIER
    },
    {
      key: "search",
      label: "Discovery",
      contribution: stats.searchGrowth * SCORE_SIGNAL_WEIGHTS.search * SCORE_SIGNAL_MULTIPLIER
    },
    {
      key: "social",
      label: "Fan response",
      contribution: stats.socialGrowth * SCORE_SIGNAL_WEIGHTS.fanResponse * SCORE_SIGNAL_MULTIPLIER
    },
    {
      key: "news",
      label: "Media",
      contribution: (stats.newsScore - 50) * SCORE_SIGNAL_WEIGHTS.media * SCORE_SIGNAL_MULTIPLIER
    },
    {
      key: "trading",
      label: "Trading",
      contribution: stats.traderDemand * SCORE_SIGNAL_WEIGHTS.trading * SCORE_SIGNAL_MULTIPLIER
    }
  ];

  return drivers.sort((first, second) => Math.abs(second.contribution) - Math.abs(first.contribution));
}

export function formatArtistMomentumContribution(contribution: number) {
  if (!Number.isFinite(contribution) || Math.abs(contribution) < Number.EPSILON) {
    return "Flat";
  }

  if (Math.abs(contribution) < 0.01) {
    return contribution > 0 ? "Slight +" : "Slight −";
  }

  return `${contribution > 0 ? "+" : ""}${contribution.toFixed(2)}`;
}
