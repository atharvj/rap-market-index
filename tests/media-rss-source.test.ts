import { describe, expect, it } from "vitest";
import type { MarketUpdateArtist } from "@/server/market/daily-update";
import { collectMediaRssMarketEvents } from "@/server/market/media-rss-source";

const artist: MarketUpdateArtist = {
  id: "baby-keem",
  name: "Baby Keem",
  ticker: "KEEM",
  currentPrice: 70,
  previousClose: 70,
  hypeScore: 55,
  volatility: 1,
  category: "mainstream",
  stats: {
    streamingGrowth: 0,
    youtubeGrowth: 0,
    searchGrowth: 0,
    socialGrowth: 0,
    newsScore: 50,
    traderDemand: 0
  }
};

const googleUrl = "https://news.google.com/rss/articles/CBMiTestArticle?oc=5";
const canonicalUrl = "https://www.billboard.com/music/rb-hip-hop/baby-keem-casino-123/";

describe("media RSS publisher-date verification", () => {
  it("rejects a resurfaced old article even when Google News gives it a recent RSS date", async () => {
    const result = await collectMediaRssMarketEvents({
      artists: [artist],
      runDate: "2026-08-03",
      feedUrls: ["https://feeds.example.com/music.xml"],
      lookbackDays: 30,
      delayMs: 0,
      timeoutMs: 1_000,
      fetchImpl: createMediaFetch("2026-02-10T19:44:37Z")
    });

    expect(result.eventsByArtist[artist.id]).toBeUndefined();
    expect(
      result.observations.find((observation) => observation.metric === "date_verification_rejected_count")?.value
    ).toBe(1);
  });

  it("stores the canonical publisher URL and verified date for a genuinely recent article", async () => {
    const result = await collectMediaRssMarketEvents({
      artists: [artist],
      runDate: "2026-08-03",
      feedUrls: ["https://feeds.example.com/music.xml"],
      lookbackDays: 30,
      delayMs: 0,
      timeoutMs: 1_000,
      fetchImpl: createMediaFetch("2026-07-30T19:44:37Z")
    });
    const accepted = result.eventsByArtist[artist.id]?.[0];

    expect(accepted).toMatchObject({
      eventDate: "2026-07-30",
      sourceUrl: canonicalUrl,
      rawPayload: {
        feedPublishedDate: "2026-07-30",
        publishedDate: "2026-07-30",
        publisherDateVerified: true
      }
    });
  });
});

function createMediaFetch(publishedAt: string): typeof fetch {
  return async (input, init) => {
    const url = String(input);

    if (url === "https://feeds.example.com/music.xml") {
      return xmlResponse("<rss><channel></channel></rss>");
    }

    if (url.startsWith("https://news.google.com/rss/search")) {
      return xmlResponse(`
        <rss><channel><item>
          <title>Baby Keem Announces Ca$ino Album Release Date</title>
          <link>${googleUrl.replace(/&/g, "&amp;")}</link>
          <pubDate>Thu, 30 Jul 2026 19:44:37 GMT</pubDate>
          <description>Baby Keem announces the new Ca$ino album.</description>
          <source url="https://ca.billboard.com">Billboard</source>
        </item></channel></rss>
      `);
    }

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
      return htmlResponse(`
        <html><head>
          <link rel="canonical" href="${canonicalUrl}"/>
          <script type="application/ld+json">{"datePublished":"${publishedAt}"}</script>
        </head></html>
      `);
    }

    throw new Error(`Unexpected media request: ${url}`);
  };
}

function xmlResponse(xml: string) {
  return new Response(xml, {
    status: 200,
    headers: { "content-type": "application/rss+xml" }
  });
}

function htmlResponse(html: string) {
  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html" }
  });
}
