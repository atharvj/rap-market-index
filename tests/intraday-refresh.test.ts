import { describe, expect, it } from "vitest";
import {
  buildIntradayArtistBatch,
  shouldRecordIntradayPriceTick
} from "@/server/market/intraday-refresh";

describe("intraday price refresh", () => {
  it("prioritizes pending catalysts, deduplicates the scan, and respects the batch cap", () => {
    expect(buildIntradayArtistBatch({
      pendingArtistIds: ["new-event"],
      scannedArtistIds: ["ordinary", "new-event", "later"],
      limit: 2
    })).toEqual(["new-event", "ordinary"]);
  });

  it("records only changed quotes unless a catalyst requires a processing tick", () => {
    expect(shouldRecordIntradayPriceTick({
      currentPrice: 42,
      comparisonPrice: 42,
      forced: false
    })).toBe(false);
    expect(shouldRecordIntradayPriceTick({
      currentPrice: 42.01,
      comparisonPrice: 42,
      forced: false
    })).toBe(true);
    expect(shouldRecordIntradayPriceTick({
      currentPrice: 42,
      comparisonPrice: 42,
      forced: true
    })).toBe(true);
  });
});
