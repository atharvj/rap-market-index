import type { ArtistCategory } from "@/lib/types";

import { calculateAudienceValuation } from "@/lib/audience-valuation";

export function calculateYoutubeStarterPrice({ subscribers, views }: { subscribers: number | null; views: number | null }) {
  return calculateAudienceValuation({ youtubeSubscribers: subscribers, youtubeViews: views }).targetPrice;
}

export function getStarterCategory(price: number): ArtistCategory {
  if (price >= 100) {
    return "superstar";
  }

  if (price >= 55) {
    return "mainstream";
  }

  if (price >= 22) {
    return "rising";
  }

  return "underground";
}

export function getStarterVolatility(category: ArtistCategory) {
  if (category === "superstar") {
    return 0.85;
  }

  if (category === "mainstream") {
    return 1.15;
  }

  if (category === "rising") {
    return 1.6;
  }

  return 1.95;
}
