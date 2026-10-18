import { expect, it } from "vitest";
import { restoreAppleChartSignals } from "@/server/market/apple-charts-source";
import type { MarketUpdateArtist } from "@/server/market/daily-update";

const artist = { id: "artist" } as MarketUpdateArtist;
const prior = { artist: { runDate: "2026-10-17", schemaVersion: 2, scores: { us: 80, "us:albums": 20 },
  chartUpdatedAt: { us: "2026-10-17T10:00:00Z", "us:albums": "2026-10-17T10:00:00Z" } } };
it("uses newly recovered album evidence rather than keeping the morning's incomplete cached signal", () => {
  const signal = restoreAppleChartSignals({ artists: [artist], runDate: "2026-10-18", previous: prior,
    current: { artist: { runDate: "2026-10-18", schemaVersion: 2, scores: { us: 80, "us:albums": 40 },
      chartUpdatedAt: { us: "2026-10-18T10:00:00Z", "us:albums": "2026-10-18T10:00:00Z" } } } }).artist;
  expect(signal.stats.streamingGrowth).toBeCloseTo(1.2);
  expect(signal.rawPayload.restoredFromChartSnapshot).toBe(true);
});
it("does not interpret missing feeds as exits or an uncharted baseline as a new rally", () => {
  const current = { artist: { runDate: "2026-10-18", schemaVersion: 2, scores: { us: 80 }, chartUpdatedAt: { us: "2026-10-18T10:00:00Z" } } };
  expect(restoreAppleChartSignals({ artists: [artist], runDate: "2026-10-18", previous: prior, current }).artist.stats.streamingGrowth).toBe(0);
  expect(restoreAppleChartSignals({ artists: [artist], runDate: "2026-10-18", previous: {}, current }).artist.stats).toEqual({});
});
