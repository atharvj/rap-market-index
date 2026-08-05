import { describe, expect, it } from "vitest";
import {
  createArticleMetadataVerifier,
  isGoogleNewsArticleUrl
} from "@/server/market/article-metadata-verifier";

const googleUrl = "https://news.google.com/rss/articles/CBMiTestArticle?oc=5";
const canonicalUrl = "https://www.billboard.com/music/rb-hip-hop/baby-keem-casino-123/";

describe("article metadata verifier", () => {
  it("resolves a Google News wrapper and trusts the publisher's original date", async () => {
    const verifier = createArticleMetadataVerifier({
      fetchImpl: createVerificationFetch("2026-02-10T19:44:37Z"),
      timeoutMs: 1_000,
      requestSpacingMs: 0
    });
    const result = await verifier.verifyGoogleNewsUrl(googleUrl);

    expect(result).toEqual({
      ok: true,
      metadata: {
        canonicalUrl,
        publishedDate: "2026-02-10"
      }
    });
  });

  it("fails closed when the publisher does not expose an original publication date", async () => {
    const verifier = createArticleMetadataVerifier({
      fetchImpl: createVerificationFetch(null),
      timeoutMs: 1_000,
      requestSpacingMs: 0
    });
    const result = await verifier.verifyGoogleNewsUrl(googleUrl);

    expect(result).toEqual({ ok: false, reason: "missing_publisher_date" });
  });

  it("retries a temporary rate limit without trusting the feed date", async () => {
    let decoderAttempts = 0;
    const baseFetch = createVerificationFetch("2026-02-10T19:44:37Z");
    const verifier = createArticleMetadataVerifier({
      fetchImpl: async (input, init) => {
        if (String(input).startsWith("https://news.google.com/articles/CBMiTestArticle")) {
          decoderAttempts += 1;

          if (decoderAttempts === 1) {
            return new Response("Rate limited", {
              status: 429,
              headers: { "retry-after": "0" }
            });
          }
        }

        return baseFetch(input, init);
      },
      timeoutMs: 1_000,
      requestSpacingMs: 0
    });
    const result = await verifier.verifyGoogleNewsUrl(googleUrl);

    expect(result).toMatchObject({
      ok: true,
      metadata: { publishedDate: "2026-02-10" }
    });
    expect(decoderAttempts).toBe(2);
  });

  it("recognizes only Google News article wrappers", () => {
    expect(isGoogleNewsArticleUrl(googleUrl)).toBe(true);
    expect(isGoogleNewsArticleUrl(canonicalUrl)).toBe(false);
    expect(isGoogleNewsArticleUrl("https://news.google.com/topstories")).toBe(false);
  });
});

function createVerificationFetch(publishedAt: string | null): typeof fetch {
  return async (input, init) => {
    const url = String(input);

    if (url.startsWith("https://news.google.com/articles/CBMiTestArticle")) {
      return htmlResponse('<c-wiz><div data-n-a-ts="1785905819" data-n-a-sg="test-signature"></div></c-wiz>');
    }

    if (url === "https://news.google.com/_/DotsSplashUi/data/batchexecute" && init?.method === "POST") {
      return new Response(
        `)]}'\n\n${JSON.stringify([
          ["wrb.fr", "Fbv4je", JSON.stringify(["garturlres", `${canonicalUrl}?utm_source=test`, 1]), null, null, null, "generic"]
        ])}`,
        { status: 200 }
      );
    }

    if (url.startsWith(canonicalUrl)) {
      const dateMarkup = publishedAt ? `<script type="application/ld+json">{"datePublished":"${publishedAt}"}</script>` : "";
      return htmlResponse(`<html><head><link rel="canonical" href="${canonicalUrl}"/>${dateMarkup}</head></html>`);
    }

    throw new Error(`Unexpected verification request: ${url}`);
  };
}

function htmlResponse(html: string) {
  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html" }
  });
}
