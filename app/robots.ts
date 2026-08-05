import type { MetadataRoute } from "next";
import { getSiteUrl, isPublicIndexingEnabled } from "@/lib/site-metadata";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl();
  const publicIndexingEnabled = isPublicIndexingEnabled();

  return {
    rules: publicIndexingEnabled
      ? {
          userAgent: "*",
          allow: "/",
          disallow: ["/api/", "/dev"]
        }
      : {
          userAgent: "*",
          disallow: "/"
        },
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl
  };
}
