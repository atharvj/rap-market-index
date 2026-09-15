import { describe, expect, it } from "vitest";
import { collectAppleChartSignals } from "@/server/market/apple-charts-source";
import type { MarketUpdateArtist } from "@/server/market/daily-update";

const artists = ["Skrilla", "1900Rugrat", "BabyChiefDoIt"].map(name => ({
  id: name, name, ticker: name, currentPrice: 50, previousClose: 50, hypeScore: 50, volatility: 1, category: "rising",
  stats: { streamingGrowth: 0, youtubeGrowth: 0, searchGrowth: 0, socialGrowth: 0, newsScore: 50, traderDemand: 0 }
})) as MarketUpdateArtist[];
function chart(rank = 10) {
  return { feed: { updated: "2026-09-14T08:00:00Z", results: Array.from({ length: 100 }, (_, i) => ({
    id: String(1000 + i), name: "BabyChiefDoIt", artistName: i === rank - 1 ? "Skrilla & 1900Rugrat" : "Unlisted performer",
    artistId: String(2000 + i), artistUrl: `https://music.apple.com/us/artist/performer/${2000 + i}`,
    url: `https://music.apple.com/us/album/record/999?i=${1000 + i}`, genres: [{ genreId: "18" }]
  })) } };
}
const prior = { Skrilla: { scores: { us: 91, gb: 91, ca: 91 } } };
const collect = (payload = chart(), previous: Record<string, Record<string, unknown>> = prior) => collectAppleChartSignals({ artists, runDate: "2026-09-14", previous, fetchImpl: async () => Response.json(payload) });

describe("Apple Music chart observations", () => {
  it("seeds a baseline without inventing a change and credits only performers", async () => {
    const result = await collect(chart(), {});
    expect(result.signals.Skrilla.stats).toEqual({});
    expect(result.signals.Skrilla.rawPayload.scores).toEqual({ us: 91, gb: 91, ca: 91 });
    expect(result.signals["1900Rugrat"].rawPayload.scores).toEqual(result.signals.Skrilla.rawPayload.scores);
    expect(result.signals.BabyChiefDoIt.rawPayload.scores).toEqual({ us: 0, gb: 0, ca: 0 });
  });
  it("scores unchanged charts neutrally, rises positively and falls negatively", async () => {
    expect((await collect()).signals.Skrilla.stats.streamingGrowth).toBe(0);
    expect((await collect(chart(1))).signals.Skrilla.stats.streamingGrowth).toBeGreaterThan(0);
    expect((await collect(chart(25))).signals.Skrilla.stats.streamingGrowth).toBeLessThan(0);
    expect((await collect(chart(101))).signals.Skrilla.stats.streamingGrowth).toBeLessThan(0);
  });
  it("does not turn failed or partial charts into artist exits", async () => {
    const incomplete = chart(); incomplete.feed.results.pop();
    const result = await collect(incomplete);
    expect(result.signals).toEqual({}); expect(result.observations).toHaveLength(0); expect(result.warnings).toHaveLength(3);
  });
  it("does not dilute listening growth when an artist is uncharted on both dates", async () => {
    const result = await collect(chart(101), { Skrilla: { scores: { us: 0, gb: 0, ca: 0 } } });
    expect(result.signals.Skrilla.stats).toEqual({});
  });
  it("rejects stale charts, duplicate IDs and mismatched provider identities", async () => {
    const stale = chart(); stale.feed.updated = "2026-08-14T08:00:00Z";
    const duplicate = chart(); duplicate.feed.results[1] = duplicate.feed.results[0];
    const invalid = chart(); invalid.feed.results[0].artistUrl = "https://music.apple.com/us/artist/performer/999999";
    for (const payload of [stale, duplicate, invalid]) expect((await collect(payload)).observations).toHaveLength(0);
  });
  it("compares only countries with valid observations on both dates", async () => {
    const result = await collectAppleChartSignals({ artists, runDate: "2026-09-14", previous: prior,
      fetchImpl: async url => String(url).includes("/us/") ? Response.json(chart(1)) : new Response("Unavailable", { status: 503 }) });
    expect(result.signals.Skrilla.stats.streamingGrowth).toBeCloseTo(1.08);
    expect(result.signals.Skrilla.rawPayload.scores).toEqual({ us: 100 });
  });
});

it("rejects malformed performer names instead of reporting chart exits", async () => {
  const malformed = chart();
  Object.assign(malformed.feed.results[9], { artistName: { name: "Skrilla" } });
  expect((await collect(malformed)).observations).toHaveLength(0);
});
it("does not replace a newer saved chart with an older provider snapshot", async () => {
  const result = await collect(chart(101), { Skrilla: { ...prior.Skrilla, chartUpdatedAt: {
    us: "2026-09-14T10:00:00Z", gb: "2026-09-14T10:00:00Z", ca: "2026-09-14T10:00:00Z"
  } } });
  expect(result.signals.Skrilla).toBeUndefined();
  expect(result.observations.some(row => row.artistId === "Skrilla")).toBe(false);
});
