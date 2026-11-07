import type { MetadataRoute } from "next";
import { getInitialArtistIdentities } from "@/data/mockArtists";
import { getSiteUrl } from "@/lib/site-metadata";

const publicPages = [
  { path: "/", changeFrequency: "daily", priority: 1 },
  { path: "/markets", changeFrequency: "daily", priority: 0.9 },
  { path: "/news", changeFrequency: "daily", priority: 0.9 },
  { path: "/scout", changeFrequency: "daily", priority: 0.8 },
  { path: "/leaderboard", changeFrequency: "daily", priority: 0.7 },
  { path: "/leagues", changeFrequency: "weekly", priority: 0.6 },
  { path: "/about", changeFrequency: "monthly", priority: 0.5 },
  { path: "/help", changeFrequency: "monthly", priority: 0.5 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.3 }
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getSiteUrl();
  const pages: MetadataRoute.Sitemap = publicPages.map((page) => ({
    url: new URL(page.path, `${siteUrl}/`).toString(),
    changeFrequency: page.changeFrequency,
    priority: page.priority
  }));
  const artists: MetadataRoute.Sitemap = getInitialArtistIdentities().map((artist) => ({
    url: new URL(`/artists/${encodeURIComponent(artist.id)}`, `${siteUrl}/`).toString(),
    changeFrequency: "daily",
    priority: 0.8
  }));

  return [...pages, ...artists];
}
