import { describe, expect, it } from "vitest";
import { expandRecordingEvents, resolveRecordingArtists } from "@/server/market/recording-credits";
import { resolveNewsStoryArtists } from "@/server/market/news-story-groups";
import type { MarketEvent } from "@/server/market/market-data";
import { buildEventMarketSignals } from "@/server/market/event-signals";
import type { MarketUpdateArtist } from "@/server/market/daily-update";
const artists = [
  { id: "skrilla", name: "Skrilla", ticker: "SKRILLA" },
  { id: "1900rugrat", name: "1900Rugrat", ticker: "RUGRAT" },
  { id: "cash", name: "Cash Cobain", ticker: "CASH" },
  { id: "babychiefdoit", name: "BabyChiefDoIt", ticker: "BABY" }
];
describe("verified recording credits", () => {
  it.each(["Skrilla, 1900Rugrat - Remix (Official Video)", "Skrilla x 1900Rugrat - Remix", "Skrilla - Remix (feat. 1900Rugrat)"])("resolves performing credits in %s", title => {
    expect(resolveRecordingArtists({ title, artists, primaryArtistId: "skrilla" }).map(a => a.id)).toEqual(["skrilla", "1900rugrat"]);
  });
  it("does not treat a song title, producer or shout-out as a performing credit", () => {
    expect(resolveRecordingArtists({ title: "Cash Cobain - BabyChiefDoIt (Official Video)", description: "Produced by: Skrilla\nShout out 1900Rugrat", artists, primaryArtistId: "cash" }).map(a => a.id)).toEqual(["cash"]);
  });
  it("accepts explicit performer metadata and rejects substring matches", () => {
    expect(resolveRecordingArtists({ title: "Skrilla - Remix", description: "Artists: Skrilla & 1900Rugrat", artists, primaryArtistId: "skrilla" })).toHaveLength(2);
    expect(resolveRecordingArtists({ title: "Skrilla - Remix feat. BabyChiefDoItFan", artists, primaryArtistId: "skrilla" })).toHaveLength(1);
  });
  it("uses identical verified participants on artist pages and in pricing, without duplicating refreshes", () => {
    const event: MarketEvent = { artistId: "skrilla", eventDate: "2026-09-04", eventType: "release", title: "Skrilla, 1900Rugrat - Remix (Official Video)", sourceUrl: "https://www.youtube.com/watch?v=abcdefghijk", sentimentScore: 24, impactScore: 30, confidence: 0.9, rawPayload: { source: "youtube_upload_event", classificationReason: "official_video_upload_title" } };
    const expanded = expandRecordingEvents({ skrilla: [event] }, artists);
    expect(Object.keys(expanded)).toEqual(["skrilla", "1900rugrat"]);
    expect(expanded["1900rugrat"][0].rawPayload.artistRole).toBe("co_artist");
    expect(expanded["1900rugrat"][0].rawPayload.artistCurrentPrice).toBeNull();
    expect(expandRecordingEvents(expanded, artists)).toEqual(expanded);
    const marketArtists: MarketUpdateArtist[] = artists.map(a => ({ ...a, currentPrice: 50, previousClose: 50, hypeScore: 50, volatility: 1, category: "rising", stats: { streamingGrowth: 0, youtubeGrowth: 0, socialGrowth: 0, searchGrowth: 0, newsScore: 50, traderDemand: 0 } }));
    const signals = buildEventMarketSignals({ artists: marketArtists, runDate: "2026-09-05", eventsByArtist: expanded });
    expect(signals.skrilla.stats.searchGrowth).toBeGreaterThan(0);
    expect(signals["1900rugrat"].stats.searchGrowth).toBeGreaterThan(0);
    const row = { id: "1", artist_id: "skrilla", event_date: event.eventDate, title: event.title, source_url: event.sourceUrl!, raw_payload: event.rawPayload };
    expect(resolveNewsStoryArtists({ primary: row, events: [row], artists }).map(a => a.id)).toEqual(Object.keys(expanded));
  });
});
