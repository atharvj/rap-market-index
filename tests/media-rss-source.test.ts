import { describe, expect, it } from "vitest";
import type { MarketUpdateArtist } from "@/server/market/daily-update";
import {
  buildArtistNewsQueries,
  collectMediaRssMarketEvents
} from "@/server/market/media-rss-source";

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
  it("uses separate focused searches so major live announcements are not buried by general coverage", () => {
    const queries = buildArtistNewsQueries({ ...artist, name: "Young Thug" });

    expect(queries).toHaveLength(2);
    expect(queries[0]).toContain('"Young Thug"');
    expect(queries[0]).toContain("album");
    expect(queries[1]).toContain("tour");
    expect(queries[1]).toContain("interview");
  });

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

  it("rejects a direct RSS item that points to an artist archive", async () => {
    const result = await collectMediaRssMarketEvents({
      artists: [{ ...artist, id: "kendrick-lamar", name: "Kendrick Lamar", ticker: "KDOT" }],
      runDate: "2026-08-09",
      feedUrls: ["https://feeds.example.com/music.xml"],
      includeGoogleNews: false,
      lookbackDays: 30,
      delayMs: 0,
      timeoutMs: 1_000,
      fetchImpl: createArchiveFeedFetch()
    });

    expect(result.eventsByArtist["kendrick-lamar"]).toBeUndefined();
    expect(
      result.observations.find((observation) => observation.metric === "date_verification_rejected_count")?.value
    ).toBe(1);
  });

  it("attributes a trusted tour story to a supporting artist only when the publisher names them", async () => {
    const supportingArtist = { ...artist, id: "tezzus", name: "Tezzus", ticker: "TEZZUS" };
    const accepted = await collectMediaRssMarketEvents({
      artists: [supportingArtist],
      runDate: "2026-08-03",
      feedUrls: ["https://feeds.example.com/music.xml"],
      lookbackDays: 30,
      delayMs: 0,
      timeoutMs: 1_000,
      fetchImpl: createTourFetch("The New Generation Tour features Tezzus alongside Young Thug.")
    });
    const rejected = await collectMediaRssMarketEvents({
      artists: [supportingArtist],
      runDate: "2026-08-03",
      feedUrls: ["https://feeds.example.com/music.xml"],
      lookbackDays: 30,
      delayMs: 0,
      timeoutMs: 1_000,
      fetchImpl: createTourFetch("The New Generation Tour features Young Thug.")
    });

    expect(accepted.eventsByArtist.tezzus?.[0]).toMatchObject({
      artistId: "tezzus",
      eventType: "tour",
      eventDate: "2026-07-13"
    });
    expect(rejected.eventsByArtist.tezzus).toBeUndefined();
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
          <meta property="og:type" content="article"/>
          <meta property="og:title" content="Baby Keem Announces Ca$ino Album Release Date"/>
          <meta property="og:description" content="Baby Keem announces the new Ca$ino album."/>
          <script type="application/ld+json">{"@type":"NewsArticle","url":"${canonicalUrl}","headline":"Baby Keem Announces Ca$ino Album Release Date","datePublished":"${publishedAt}"}</script>
        </head></html>
      `);
    }

    throw new Error(`Unexpected media request: ${url}`);
  };
}

function createTourFetch(summary: string): typeof fetch {
  const tourCanonicalUrl = "https://pitchfork.com/story/young-thug-announces-ysl-tour/";

  return async (input, init) => {
    const url = String(input);

    if (url === "https://feeds.example.com/music.xml") {
      return xmlResponse("<rss><channel></channel></rss>");
    }

    if (url.startsWith("https://news.google.com/rss/search")) {
      return xmlResponse(`
        <rss><channel><item>
          <title>Young Thug Announces YSL Tour</title>
          <link>${googleUrl.replace(/&/g, "&amp;")}</link>
          <pubDate>Mon, 13 Jul 2026 07:00:00 GMT</pubDate>
          <description>Young Thug announces the New Generation Tour.</description>
          <source url="https://pitchfork.com">Pitchfork</source>
        </item></channel></rss>
      `);
    }

    if (url.startsWith("https://news.google.com/articles/CBMiTestArticle")) {
      return htmlResponse('<c-wiz><div data-n-a-ts="1785905819" data-n-a-sg="test-signature"></div></c-wiz>');
    }

    if (url === "https://news.google.com/_/DotsSplashUi/data/batchexecute" && init?.method === "POST") {
      return new Response(
        `)]}'\n\n${JSON.stringify([
          ["wrb.fr", "Fbv4je", JSON.stringify(["garturlres", tourCanonicalUrl, 1]), null, null, null, "generic"]
        ])}`,
        { status: 200 }
      );
    }

    if (url.startsWith(tourCanonicalUrl)) {
      return htmlResponse(`
        <html><head>
          <link rel="canonical" href="${tourCanonicalUrl}"/>
          <meta property="og:type" content="article"/>
          <meta property="og:title" content="Young Thug Announces YSL Tour"/>
          <meta property="og:description" content="${summary}"/>
          <script type="application/ld+json">{"@type":"NewsArticle","url":"${tourCanonicalUrl}","headline":"Young Thug Announces YSL Tour","datePublished":"2026-07-13T07:00:00Z"}</script>
        </head></html>
      `);
    }

    throw new Error(`Unexpected tour request: ${url}`);
  };
}

function createArchiveFeedFetch(): typeof fetch {
  const archiveUrl = "https://pitchfork.com/artists/29812-kendrick-lamar/";

  return async (input) => {
    const url = String(input);

    if (url === "https://feeds.example.com/music.xml") {
      return xmlResponse(`
        <rss><channel><item>
          <title>Kendrick Lamar GNX Album Review Receives Critical Acclaim</title>
          <link>${archiveUrl}</link>
          <pubDate>Fri, 07 Aug 2026 19:18:00 GMT</pubDate>
          <description>A new review says Kendrick Lamar's GNX continues to receive critical acclaim.</description>
          <source url="https://pitchfork.com">Pitchfork</source>
        </item></channel></rss>
      `);
    }

    if (url === archiveUrl) {
      return htmlResponse(`
        <html><head>
          <link rel="canonical" href="${archiveUrl}"/>
          <meta property="og:type" content="website"/>
          <meta property="og:title" content="Kendrick Lamar - Albums, Songs, and News | Pitchfork"/>
          <script type="application/ld+json">
            {"@type":"Review","url":"https://pitchfork.com/reviews/albums/kendrick-lamar-gnx/","headline":"GNX","datePublished":"2024-11-26"}
          </script>
        </head><body><h1>Kendrick Lamar</h1></body></html>
      `);
    }

    throw new Error(`Unexpected archive feed request: ${url}`);
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
