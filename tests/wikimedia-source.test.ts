import { describe, expect, it } from "vitest";
import { collectWikimediaMarketSignals } from "@/server/market/wikimedia-source";
import type { MarketUpdateArtist } from "@/server/market/daily-update";

const artist: MarketUpdateArtist = {
  id: "artist", name: "Artist", ticker: "ART", currentPrice: 50, previousClose: 50,
  hypeScore: 50, volatility: 1, category: "mainstream",
  stats: { streamingGrowth: 0, youtubeGrowth: 0, searchGrowth: 0, socialGrowth: 0, newsScore: 50, traderDemand: 0 }
};
const items = (views: number[]) => views.map((value, i) => ({ timestamp: `202609${String(i + 1).padStart(2, "0")}00`, views: value }));

async function collect(views: number[]) {
  const requests: string[] = [];
  const result = await collectWikimediaMarketSignals({
    artists: [artist], runDate: "2026-09-15", delayMs: 0,
    externalIds: { artist: { artistId: "artist", wikipediaArticleTitle: "Artist (rapper)" } },
    fetchImpl: async (url, init) => {
      expect(new Headers(init?.headers).get("user-agent")).toContain("https://rap-market-index.vercel.app");
      requests.push(String(url));
      return Response.json({ items: items(views) });
    }
  });
  return { ...result, requests };
}

describe("measured daily public attention", () => {
  it.each([
    ["Drake", "Drake (musician)"], ["Ian", "Ian (rapper)"], ["NAV", "Nav (rapper)"], ["Feng", "Feng (rapper)"]
  ])("uses %s's verified artist page instead of a legacy name-page match", async (name, title) => {
    const result = await collectWikimediaMarketSignals({
      artists: [{ ...artist, name }], runDate: "2026-09-15", delayMs: 0,
      previousArticles: { artist: { title: name, matchConfidence: 0.82 } },
      fetchImpl: async url => {
        expect(String(url)).toContain(`/${encodeURIComponent(title.replaceAll(" ", "_"))}/daily/`);
        return Response.json({ items: items(Array(14).fill(100)) });
      }
    });
    expect(result.signals.artist.rawPayload.title).toBe(title);
  });
  it("keeps unchanged attention neutral and bypasses discovery for verified identities", async () => {
    const result = await collect(Array(14).fill(100));
    expect(result.signals.artist.stats.searchGrowth).toBe(0);
    expect(result.requests).toHaveLength(1);
    expect(result.requests[0]).toContain("/Artist_(rapper)/daily/2026090100/2026091400");
    expect(result.observations.find(o => o.metric === "pageviews_7d")?.value).toBe(700);
  });

  it.each([[300, 1], [20, -1]])("responds to %s last-day views without needing a stored baseline", async (last, direction) => {
    const result = await collect([...Array(13).fill(100), last]);
    expect(Math.sign(result.signals.artist.stats.searchGrowth ?? 0)).toBe(direction);
  });

  it("does not treat incomplete or invalid provider data as zero audience", async () => {
    for (const values of [[], Array(7).fill(100), [...Array(13).fill(100), -1]]) {
      const result = await collect(values);
      expect(result.signals.artist.stats).toEqual({});
      expect(result.observations.some(o => o.metric === "pageviews_7d")).toBe(false);
    }
  });

  it("reuses a previously matched article and retains provenance", async () => {
    const result = await collectWikimediaMarketSignals({
      artists: [artist], runDate: "2026-09-15", delayMs: 0,
      previousArticles: { artist: { title: "Artist (musician)", matchConfidence: 0.82 } },
      fetchImpl: async url => {
        expect(String(url)).toContain("/Artist_(musician)/daily/");
        return Response.json({ items: items(Array(14).fill(100)) });
      }
    });
    expect(result.signals.artist.rawPayload.title).toBe("Artist (musician)");
  });

  it("respects long Retry-After responses without continuing requests", async () => {
    const requests: string[] = [];
    await collectWikimediaMarketSignals({
      artists: [artist, { ...artist, id: "unknown", name: "Unknown" }, { ...artist, id: "known" }],
      externalIds: { known: { artistId: "known", wikipediaArticleTitle: "Known rapper" } },
      runDate: "2026-09-15", delayMs: 0,
      fetchImpl: async url => {
        requests.push(String(url));
        return String(url).includes("/w/api.php") ? new Response("Rate limited", { status: 429, headers: { "retry-after": "60" } }) : Response.json({ items: items(Array(14).fill(100)) });
      }
    });
    expect(requests.filter(url => url.includes("/w/api.php"))).toHaveLength(1);
    expect(requests.filter(url => url.includes("/pageviews/"))).toHaveLength(0);
  });
});
