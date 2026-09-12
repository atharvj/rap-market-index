import { describe, expect, it } from "vitest";
import { mergeAdapterSignals } from "@/server/market/daily-update";
import { restoreDailySources } from "@/server/market/daily-source-cache";
import type { AdapterSignals } from "@/server/market/market-data";

describe("same-day source continuity", () => {
  it("preserves confidence and calibrates each source only once when reused intraday", () => {
    const wiki: AdapterSignals = Object.fromEntries(Array.from({ length: 15 }, (_, i) => [String(i), {
      stats: { searchGrowth: 10 + i }, confidence: 0.72,
      rawPayload: { source: "wikimedia", status: "ok", pageviews1d: 500 + i }
    }]));
    const daily = mergeAdapterSignals(wiki);
    const rows = Object.entries(daily).map(([artist_id, signal]) => ({
      artist_id, source_date: "2026-09-12", raw_payload: signal.rawPayload
    }));
    const restored = restoreDailySources(rows, "2026-09-12");
    const intraday = mergeAdapterSignals(...restored);
    for (const id of Object.keys(daily)) {
      expect(intraday[id].stats).toEqual(daily[id].stats);
      expect(intraday[id].rawPayload.sourceWeights).toEqual(daily[id].rawPayload.sourceWeights);
      const subset = mergeAdapterSignals(...restoreDailySources(rows.filter(row => row.artist_id === id), "2026-09-12"));
      expect(subset[id].stats).toEqual(daily[id].stats);
    }
    expect(restoreDailySources(rows, "2026-09-13")).toEqual([]);
  });

  it("does not replay events, trading activity, or malformed cached inputs", () => {
    const signal = (source: string) => ({ stats: { socialGrowth: 12 }, rawPayload: { source } });
    const daily = mergeAdapterSignals({ artist: signal("market_events") }, { artist: signal("trade_flow") });
    const row = { artist_id: "artist", source_date: "2026-09-12", raw_payload: daily.artist.rawPayload };
    expect(restoreDailySources([row], row.source_date)).toEqual([]);
    expect(restoreDailySources([{ ...row, raw_payload: { dailySourceInputs: { wikimedia: { stats: { searchGrowth: "bad" } } } } }], row.source_date)).toEqual([]);
  });
});
