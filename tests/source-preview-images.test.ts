import { describe, expect, it } from "vitest";
import { extractSourcePreviewImageCandidates } from "@/server/market/source-preview-images";

describe("source preview image extraction", () => {
  it("prefers secure Open Graph and supports alternate social metadata", () => {
    const candidates = extractSourcePreviewImageCandidates(`
      <html>
        <head>
          <meta content="https://cdn.test/basic.jpg" property="og:image">
          <meta property="og:image:secure_url" content="https://cdn.test/secure.jpg">
          <meta name="twitter:image:src" content="https://cdn.test/twitter.jpg">
        </head>
      </html>
    `);

    expect(candidates.slice(0, 3)).toEqual([
      "https://cdn.test/secure.jpg",
      "https://cdn.test/basic.jpg",
      "https://cdn.test/twitter.jpg"
    ]);
  });

  it("recovers schema.org article images when social tags are missing", () => {
    const candidates = extractSourcePreviewImageCandidates(`
      <script type="application/ld+json">
        {
          "@type": "NewsArticle",
          "image": {
            "@type": "ImageObject",
            "contentUrl": "https://cdn.test/story-lead.jpg"
          }
        }
      </script>
    `);

    expect(candidates).toContain("https://cdn.test/story-lead.jpg");
  });

  it("falls back to the largest lazy-loaded image inside the article", () => {
    const candidates = extractSourcePreviewImageCandidates(`
      <article>
        <img
          data-src="https://cdn.test/story-small.jpg"
          data-srcset="https://cdn.test/story-480.jpg 480w, https://cdn.test/story-1440.jpg 1440w"
        >
      </article>
    `);

    expect(candidates[0]).toBe("https://cdn.test/story-1440.jpg");
  });
});
