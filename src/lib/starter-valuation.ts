import type { ArtistCategory } from "@/lib/types";

export function calculateSpotifyStarterPrice({
  popularity,
  followers
}: {
  popularity: number | null;
  followers: number | null;
}) {
  if (popularity === null && followers === null) {
    return null;
  }

  const popularityScore = popularity === null ? 0 : popularity;
  const followerScore = followers === null ? 0 : clamp((Math.log10(followers + 1) - 3) / 5, 0, 1) * 100;

  return clamp(8 + Math.max(popularityScore, followerScore) * 1.18, 6, 140);
}

export function calculateYoutubeStarterPrice({
  subscribers,
  views
}: {
  subscribers: number | null;
  views: number | null;
}) {
  if (subscribers === null && views === null) {
    return null;
  }

  const subscriberScore = subscribers === null ? 0 : clamp((Math.log10(subscribers + 1) - 3) / 4, 0, 1) * 65;
  const viewScore = views === null ? 0 : clamp((Math.log10(views + 1) - 5) / 5, 0, 1) * 55;
  const audienceScore = subscriberScore * 0.58 + viewScore * 0.42;

  return clamp(8 + audienceScore * 1.35, 6, 135);
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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
