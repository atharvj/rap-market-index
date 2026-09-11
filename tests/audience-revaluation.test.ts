import { describe, expect, it } from "vitest";
import { calculateAudienceValuation } from "@/lib/audience-valuation";
import { calculateDailyMarketUpdates, type MarketUpdateArtist } from "@/server/market/daily-update";
import { createAudienceRevaluation, readAudienceRevaluation, priceForTrendAnalysis } from "@/server/market/audience-revaluation";

const date = "2026-09-05";
const stats = { streamingGrowth: 0, youtubeGrowth: 0, searchGrowth: 0, socialGrowth: 0, newsScore: 50, traderDemand: 0 };
const calibration = calculateAudienceValuation({ monthlyListeners: 821786, lastfmListeners: 71293, lastfmPlays: 3037722, youtubeSubscribers: 27100, youtubeViews: 4417177 });
const artist = (category: MarketUpdateArtist["category"], price = 12.49): MarketUpdateArtist => ({ id: "example", name: "Example", ticker: "TEST", category, stats, currentPrice: price, quotedPrice: price, previousClose: price, hypeScore: 50, volatility: 1 });

describe("audience revaluation boundary", () => {
  it.each(["superstar", "mainstream", "rising", "underground"] as const)("applies once and survives refreshes for %s", category => {
    const original = artist(category);
    const record = createAudienceRevaluation(original, calibration, date);
    const calculate = (value: MarketUpdateArtist, intraday = false) => calculateDailyMarketUpdates({ artists: [value], runDate: date, source: "core", intraday, audienceRevaluations: { example: record } }).updates[0];
    const first = calculate(original);
    expect(first.currentPrice).toBe(38);
    expect(first.previousClose).toBe(12.49);
    expect(first.dailyChangePercent).toBeCloseTo(204.2434, 3);
    const refreshed = { ...original, currentPrice: first.currentPrice, quotedPrice: first.currentPrice };
    expect(calculate(refreshed).currentPrice).toBe(38);
    expect(calculate(refreshed, true).currentPrice).toBe(38);
    expect(readAudienceRevaluation(first.rawPayload.audienceRevaluation, date)).toEqual(record);
    expect(readAudienceRevaluation(record, "2026-09-06")).toBeNull();
    const next = calculateDailyMarketUpdates({ artists: [{ ...original, currentPrice: 38, previousClose: 38, quotedPrice: 38 }], runDate: "2026-09-06", source: "core" });
    expect(next.updates[0].currentPrice).toBe(38);
    expect(next.updates[0].dailyChangePercent).toBe(0);
  });

  it("preserves an intraday trade quote to the cent without rounding drift", () => {
    const original = artist("rising");
    const record = createAudienceRevaluation(original, calibration, date);
    for (let cents = 0; cents < 100; cents += 1) {
      const quote = 38 + cents / 100;
      const result = calculateDailyMarketUpdates({ artists: [{ ...original, currentPrice: quote, quotedPrice: quote }], runDate: date, source: "core", intraday: true, audienceRevaluations: { example: record } });
      expect(result.updates[0].currentPrice).toBe(quote);
    }
  });

  it("excludes a model correction from subsequent technical momentum without changing stored history", () => {
    const original = artist("rising");
    const record = createAudienceRevaluation(original, calibration, date);
    const history = [{ date: "2026-09-04", price: 12.49 }, { date, price: 38 }];
    const analyticPrices = history.map(point => priceForTrendAnalysis(point.price, point.date, [record]));
    expect(analyticPrices[0]).toBeCloseTo(38);
    expect(analyticPrices[1]).toBe(38);
    expect(history[0].price).toBe(12.49);
  });

  it("corrects overpriced listings with the same rule", () => {
    const original = artist("mainstream", 80);
    const record = createAudienceRevaluation(original, calibration, date);
    const result = calculateDailyMarketUpdates({ artists: [original], runDate: date, source: "core", audienceRevaluations: { example: record } });
    expect(result.updates[0].currentPrice).toBe(38);
    expect(result.updates[0].dailyChangePercent).toBe(-52.5);
  });

  it("rejects unsupported evidence, opening listings, and corrupted factors", () => {
    expect(() => createAudienceRevaluation(artist("rising"), calculateAudienceValuation({ monthlyListeners: 821786 }), date)).toThrow(/two platforms/);
    expect(() => createAudienceRevaluation({ ...artist("rising"), baselineOnly: true }, calibration, date)).toThrow(/recorded close/);
    const record = createAudienceRevaluation(artist("rising"), calibration, date);
    expect(readAudienceRevaluation({ ...record, factor: 999 }, date)).toBeNull();
  });
});
