import { afterEach, describe, expect, it } from "vitest";
import robots from "../app/robots";
import sitemap from "../app/sitemap";
import { createPageMetadata, getSiteUrl } from "@/lib/site-metadata";

const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
const originalPublicIndexing = process.env.NEXT_PUBLIC_RMI_PUBLIC_INDEXING;

afterEach(() => {
  restoreEnvironment("NEXT_PUBLIC_SITE_URL", originalSiteUrl);
  restoreEnvironment("NEXT_PUBLIC_RMI_PUBLIC_INDEXING", originalPublicIndexing);
});

describe("site discovery metadata", () => {
  it("builds a page-specific canonical URL and social metadata", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://example.com/";

    const metadata = createPageMetadata({
      title: "Artist Markets",
      description: "Current artist quotes.",
      path: "/markets"
    });

    expect(metadata.alternates?.canonical).toBe("https://example.com/markets");
    expect(metadata.openGraph).toMatchObject({
      title: "Artist Markets",
      description: "Current artist quotes.",
      url: "https://example.com/markets"
    });
  });

  it("falls back to the live RMI origin when a configured URL is invalid", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "not a URL";

    expect(getSiteUrl()).toBe("https://rap-market-index.vercel.app");
  });

  it("honors explicit public-indexing controls", () => {
    process.env.NEXT_PUBLIC_RMI_PUBLIC_INDEXING = "false";

    expect(robots().rules).toEqual({ userAgent: "*", disallow: "/" });

    process.env.NEXT_PUBLIC_RMI_PUBLIC_INDEXING = "true";
    expect(robots().rules).toEqual({
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/dev"]
    });
  });

  it("indexes the public site by default while preserving an opt-out", () => {
    delete process.env.NEXT_PUBLIC_RMI_PUBLIC_INDEXING;

    expect(robots().rules).toEqual({
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/dev"]
    });
  });

  it("publishes unique canonical public pages without private account routes", () => {
    const entries = sitemap();
    const urls = entries.map((entry) => entry.url);

    expect(urls).toContain("https://rap-market-index.vercel.app/markets");
    expect(urls).toContain("https://rap-market-index.vercel.app/artists/kendrick-lamar");
    expect(urls.some((url) => url.includes("/account"))).toBe(false);
    expect(new Set(urls).size).toBe(urls.length);
  });
});

function restoreEnvironment(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}
