import { expect, it } from "vitest";
import { loadPreviousSignalStats } from "@/server/market/supabase-repository";

const row = (id: string) => ({ artist_id: id, source_date: "2026-10-17", streaming_growth: 0, youtube_growth: 0,
  search_growth: 0, social_growth: 0, news_score: 50, trader_demand: 0,
  event_pricing: { events: [] }, source_values: { youtube_comments: { socialGrowth: 12 } }, reception_pricing: null });
it("recovers older artists whose previous evidence was crowded out of the first page", async () => {
  const selected: string[][] = [];
  const client = { from() { const chain = {
    select() { return chain; }, in(_key: string, ids: string[]) { selected.push(ids); return chain; },
    lt() { return chain; }, order() { return chain; }, async limit() { return { error: null,
      data: selected.length === 1 ? Array(1000).fill(row("busy")) : [{ ...row("older"), reception_pricing: { youtube_comments: -8 } }] }; }
  }; return chain; } };
  const result = await loadPreviousSignalStats({ supabase: client as never, artistIds: ["busy", "older"], runDate: "2026-10-18" });
  expect(selected).toEqual([["busy", "older"], ["older"]]);
  expect(result.busy.previousReceptionBaseline).toEqual({ youtube_comments: 12 });
  expect(result.older.previousReceptionBaseline).toEqual({ youtube_comments: -8 });
});
