import type { Metadata } from "next";

export const SITE_NAME = "Rap Market Index";
export const SITE_DESCRIPTION =
  "Track rapper momentum through fantasy artist quotes, market news, signal data, and virtual portfolios.";

const FALLBACK_SITE_URL = "https://rap-market-index.vercel.app";

export function getSiteUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();

  try {
    return new URL(configuredUrl || FALLBACK_SITE_URL).origin;
  } catch {
    return FALLBACK_SITE_URL;
  }
}

export function isPublicIndexingEnabled() {
  const configuredValue = process.env.NEXT_PUBLIC_RMI_PUBLIC_INDEXING?.trim().toLowerCase();
  return !configuredValue || !["false", "0", "no", "off"].includes(configuredValue);
}

type PageMetadataOptions = {
  title: string;
  description: string;
  path: string;
  noIndex?: boolean;
};

export function createPageMetadata({
  title,
  description,
  path,
  noIndex = false
}: PageMetadataOptions): Metadata {
  const canonicalUrl = new URL(path, `${getSiteUrl()}/`).toString();

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: SITE_NAME,
      images: [
        {
          url: "/opengraph-image",
          width: 1200,
          height: 630,
          alt: "Rap Market Index market dashboard"
        }
      ],
      type: "website"
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/opengraph-image"]
    },
    ...(noIndex
      ? {
          robots: {
            index: false,
            follow: false
          }
        }
      : {})
  };
}
