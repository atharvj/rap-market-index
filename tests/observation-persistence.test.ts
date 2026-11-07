import { expect, it, vi } from "vitest";
import { persistMarketObservations } from "@/server/market/supabase-repository";
import type { MarketObservation } from "@/server/market/market-data";

const observations = (count: number, text = "") => Array.from({ length: count }, (_, i): MarketObservation => ({
  artistId: `artist-${i}`, source: "youtube", metric: "channel_views", observedDate: "2026-11-07",
  value: i, unit: "count", rawPayload: { text }
}));
function database() {
  const operations: string[] = [];
  const upsert = vi.fn(async (_rows: unknown[], _options: unknown): Promise<{ error: { code?: string; message: string } | null }> => {
    operations.push("save"); return { error: null };
  });
  const clear = vi.fn(async () => { operations.push("clear"); return { error: null }; });
  const from = vi.fn(() => ({ upsert, delete() { const query = { eq: () => query, in: clear }; return query; } }));
  return { client: { from } as never, from, upsert, clear, operations };
}

it("does not write an empty observation set", async () => {
  const db = database(); await persistMarketObservations(db.client, []); expect(db.from).not.toHaveBeenCalled();
});
it("saves every observation in bounded batches before clearing source failures", async () => {
  const db = database(); await persistMarketObservations(db.client, observations(205));
  expect(db.upsert.mock.calls.map(call => call[0].length)).toEqual([100, 100, 5]);
  expect(db.upsert.mock.calls.flatMap(call => call[0])).toHaveLength(205);
  expect(db.operations).toEqual(["save", "save", "save", "clear"]);
  expect(db.upsert.mock.calls.every(call => (call[1] as { onConflict: string }).onConflict === "artist_id,source,metric,observed_date")).toBe(true);
});
it("bounds UTF-8 payloads and retains an individual oversized record intact", async () => {
  const db = database(); const rows = observations(6, "🎧".repeat(70000));
  rows.push({ ...observations(1, "x".repeat(1200000))[0], artistId: "large" });
  await persistMarketObservations(db.client, rows);
  const batches = db.upsert.mock.calls.map(call => call[0]);
  expect(batches.flat()).toHaveLength(7);
  expect(batches.every(batch => batch.length === 1 || new TextEncoder().encode(JSON.stringify(batch)).byteLength <= 1024 * 1024)).toBe(true);
  expect((batches.flat().at(-1) as { raw_payload: { text: string } }).raw_payload.text).toHaveLength(1200000);
});
it("retries a canceled save once using identical rows and observation timestamps", async () => {
  const db = database(); db.upsert.mockResolvedValueOnce({ error: { code: "57014", message: "statement timeout" } });
  await persistMarketObservations(db.client, observations(1));
  expect(db.upsert).toHaveBeenCalledTimes(2);
  expect(db.upsert.mock.calls[0][0]).toEqual(db.upsert.mock.calls[1][0]);
  expect(db.clear).toHaveBeenCalledOnce();
});
it.each(["57014", "23505"])("stops after a failed batch (%s), retaining failure flags and preventing later saves", async code => {
  const db = database(); db.upsert.mockResolvedValueOnce({ error: null }).mockResolvedValue({ error: { code, message: "save failed" } });
  await expect(persistMarketObservations(db.client, observations(205))).rejects.toThrow("Could not save market observations");
  expect(db.upsert).toHaveBeenCalledTimes(code === "57014" ? 3 : 2);
  expect(db.clear).not.toHaveBeenCalled();
  expect(db.upsert.mock.calls.every(call => call[0].length === 100)).toBe(true);
});
it.each(["duplicate", "nonfinite"])("rejects %s observation input before writing any batch", async invalid => {
  const db = database(); const rows = observations(205);
  if (invalid === "duplicate") rows.push(rows[0]); else rows[204].value = Number.NaN;
  await expect(persistMarketObservations(db.client, rows)).rejects.toThrow();
  expect(db.from).not.toHaveBeenCalled();
});
