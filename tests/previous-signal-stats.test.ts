import { expect, it, vi } from "vitest";
import { loadPreviousSignalStats } from "@/server/market/supabase-repository";

const row = (id: string) => ({ artist_id: id, source_date: "2026-10-17", streaming_growth: 0, youtube_growth: 0,
  search_growth: 0, social_growth: 0, news_score: 50, trader_demand: 0,
  event_pricing: { events: [] }, source_values: { youtube_comments: { socialGrowth: 12 } }, reception_pricing: null });
it("reads bounded prior snapshots and retains reception baselines for older artists", async () => {
  const rpc = vi.fn().mockResolvedValue({ error: null, data: [row("busy"), { ...row("older"), reception_pricing: { youtube_comments: -8 } }] });
  const result = await loadPreviousSignalStats({ supabase: { rpc } as never, artistIds: ["busy", "older", "busy"], runDate: "2026-10-18" });
  expect(rpc).toHaveBeenCalledWith("get_previous_market_signals", { p_artist_ids: ["busy", "older"], p_before_date: "2026-10-18" });
  expect(result.busy.previousReceptionBaseline).toEqual({ youtube_comments: 12 });
  expect(result.older.previousReceptionBaseline).toEqual({ youtube_comments: -8 });
});
it("rejects a failed lookup instead of repricing without prior evidence", async () => {
  const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "statement timeout" } });
  await expect(loadPreviousSignalStats({ supabase: { rpc } as never, artistIds: ["a"], runDate: "2026-11-05" })).rejects.toThrow("Could not load previous signal snapshots");
});
