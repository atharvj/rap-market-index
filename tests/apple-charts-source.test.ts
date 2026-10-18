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
const collect = (payload = chart(), previous: Record<string, Record<string, unknown>> = prior) => collectAppleChartSignals({ artists, runDate: "2026-09-14", previous, includeAlbums: false, fetchImpl: async () => Response.json(payload) });

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
    const result = await collectAppleChartSignals({ artists, runDate: "2026-09-14", previous: prior, includeAlbums: false,
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

function albumChart(rank = 10) {
  const payload = chart(rank);
  payload.feed.results = payload.feed.results.map(entry => ({ ...entry, name: "Album (feat. BabyChiefDoIt)",
    url: `https://music.apple.com/us/album/record/${entry.id}` }));
  return payload;
}
const combinedFetch = (songRank = 10, albumRank = 10): typeof fetch => async input =>
  Response.json(String(input).endsWith("/albums.json") ? albumChart(albumRank) : chart(songRank));

describe("album chart coverage", () => {
  it("recovers a transient partial replica without publishing a partial total", async () => {
    const calls = new Map<string, number>();
    const result = await collectAppleChartSignals({ artists, runDate: "2026-09-14", fetchImpl: async input => {
      const url = String(input), count = (calls.get(url) ?? 0) + 1; calls.set(url, count);
      const payload = url.endsWith("/albums.json") ? albumChart() : chart();
      if (count === 1) payload.feed.results.pop();
      return Response.json(payload);
    } });
    expect(result.warnings).toEqual([]);
    expect((result.signals.Skrilla.rawPayload.scores as Record<string, number>)).toHaveProperty("ca:albums");
    expect(result.observations.find(row => row.artistId === "Skrilla" && row.metric === "album_chart_points")?.value).toBe(273);
    expect([...calls.values()]).toEqual(Array(6).fill(2));
  });
  it("adds a separate album baseline without changing song points or inventing an album rally", async () => {
    const result = await collectAppleChartSignals({ artists, runDate: "2026-09-14", previous: prior, fetchImpl: combinedFetch() });
    expect(result.signals.Skrilla.stats.streamingGrowth).toBe(0);
    expect(result.observations.find(o => o.artistId === "Skrilla" && o.metric === "chart_points")?.value).toBe(273);
    expect(result.observations.find(o => o.artistId === "Skrilla" && o.metric === "album_chart_points")?.value).toBe(273);
    expect(result.signals.BabyChiefDoIt.rawPayload.albums).toEqual([]);
    expect((result.signals.Skrilla.rawPayload.albums as unknown[])).toHaveLength(3);
  });
  it("measures an album rank change only against an existing album baseline", async () => {
    const first = await collectAppleChartSignals({ artists, runDate: "2026-09-14", fetchImpl: combinedFetch() });
    const previous = Object.fromEntries(Object.entries(first.signals).map(([id, signal]) => [id, signal.rawPayload]));
    const second = await collectAppleChartSignals({ artists, runDate: "2026-09-14", previous, fetchImpl: combinedFetch(10, 1) });
    expect(second.signals.Skrilla.stats.streamingGrowth).toBeCloseTo(0.54);
  });
  it("retains an album-only snapshot during song-feed failures without creating song exits", async () => {
    const result = await collectAppleChartSignals({ artists, runDate: "2026-09-14", previous: prior,
      fetchImpl: async input => String(input).endsWith("/albums.json") ? Response.json(albumChart()) : new Response("Unavailable", { status: 503 }) });
    expect(result.signals.Skrilla.stats).toEqual({});
    expect(result.signals.Skrilla.rawPayload.scores).toEqual({ "us:albums": 91, "gb:albums": 91, "ca:albums": 91 });
    expect(result.observations.some(o => o.metric === "chart_points")).toBe(false);
    expect(result.observations.some(o => o.metric === "chart_snapshot")).toBe(true);
  });
  it("does not publish a smaller regional sum when a country feed fails", async () => {
    const result = await collectAppleChartSignals({ artists, runDate: "2026-09-14", previous: prior,
      fetchImpl: async input => String(input).includes("/us/") ? combinedFetch()(input) : new Response("Unavailable", { status: 503 }) });
    expect(result.observations.every(o => o.metric === "chart_snapshot")).toBe(true);
    expect(result.signals.Skrilla.stats.streamingGrowth).toBe(0);
  });
  it("rejects a solo namesake with a different verified provider ID", async () => {
    const thug = { ...artists[0], id: "young-thug", name: "Young Thug" };
    const payload = chart(); payload.feed.results[9].artistName = "Young Thug";
    const result = await collectAppleChartSignals({ artists: [thug], runDate: "2026-09-14", includeAlbums: false, fetchImpl: async () => Response.json(payload) });
    expect(result.signals[thug.id].rawPayload.tracks).toEqual([]);
  });
});

it("retains legitimate Various Artists compilation ranks without inventing performer credits", async () => {
  const payload = albumChart();
  Object.assign(payload.feed.results[0], { artistName: "Various Artists", name: "Skrilla Greatest Hits", artistId: undefined, artistUrl: undefined });
  const result = await collectAppleChartSignals({ artists, runDate: "2026-09-14",
    fetchImpl: async input => Response.json(String(input).endsWith("/albums.json") ? payload : chart()) });
  expect(result.warnings).toEqual([]);
  expect(result.observations.find(o => o.artistId === "Skrilla" && o.metric === "album_chart_points")?.value).toBe(273);
  Object.assign(payload.feed.results[0], { artistName: "Skrilla" });
  const invalid = await collectAppleChartSignals({ artists, runDate: "2026-09-14", fetchImpl: async () => Response.json(payload) });
  expect(invalid.observations).toHaveLength(0);
});

it("bounds the expanded feed scan instead of bursting six requests at the provider", async () => {
  let active = 0, peak = 0, requests = 0;
  const result = await collectAppleChartSignals({ artists, runDate: "2026-09-14", fetchImpl: async input => {
    requests++; active++; peak = Math.max(peak, active);
    await Promise.resolve();
    active--;
    return Response.json(String(input).endsWith("/albums.json") ? albumChart() : chart());
  } });
  expect(requests).toBe(6);
  expect(peak).toBe(2);
  expect(result.warnings).toEqual([]);
});

it("preserves a more complete same-day stored snapshot without pricing the retained country or publishing a partial total", async () => {
  const first = await collectAppleChartSignals({ artists, runDate: "2026-09-14", fetchImpl: combinedFetch() });
  const currentSnapshots = Object.fromEntries(Object.entries(first.signals).map(([id, signal]) => [id, signal.rawPayload]));
  const second = await collectAppleChartSignals({ artists, runDate: "2026-09-14", previous: prior, currentSnapshots,
    fetchImpl: async input => String(input).includes("/us/") && String(input).endsWith("/songs.json") ? new Response("Unavailable", { status: 503 }) : combinedFetch()(input) });
  const snapshot = second.observations.find(o => o.artistId === "Skrilla" && o.metric === "chart_snapshot");
  expect(snapshot?.value).toBe(6);
  expect(snapshot?.rawPayload).toMatchObject({ scores: { us: 91 }, retainedKeys: ["us"], missingKeys: ["us"] });
  expect(second.signals.Skrilla.rawPayload.scores).not.toHaveProperty("us");
  expect(second.observations.some(o => o.metric === "chart_points")).toBe(false);
  expect(second.signals.Skrilla.stats.streamingGrowth).toBe(0);
});
