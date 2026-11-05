import { expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { writeJsonArray, readBackupPage, backupCursorFilter } from "../scripts/stream-json-array.mjs";

it("writes pages before requesting the next page and preserves JSON and checksum", async () => {
  const dir = await mkdtemp(join(tmpdir(), "rmi-stream-test-")); const file = join(dir, "rows.json");
  try {
    async function* pages() {
      yield [{ id: 1, text: 'unicode é and "quotes"', payload: "x".repeat(100000) }];
      expect((await stat(file)).size).toBeGreaterThan(100000);
      yield [{ id: 2, text: "second page" }];
    }
    const report = await writeJsonArray(file, pages()); const text = await readFile(file, "utf8");
    expect(JSON.parse(text).map((row: { id: number }) => row.id)).toEqual([1, 2]);
    expect(report).toEqual({ rowCount: 2, sha256: createHash("sha256").update(text).digest("hex") });
    expect((await stat(file)).mode & 0o777).toBe(0o600);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
it("removes a partial table when a later source page fails", async () => {
  const dir = await mkdtemp(join(tmpdir(), "rmi-stream-fail-")); const file = join(dir, "rows.json");
  try {
    async function* pages() { yield [{ id: 1 }]; throw new Error("source unavailable"); }
    await expect(writeJsonArray(file, pages())).rejects.toThrow("source unavailable");
    await expect(stat(file)).rejects.toMatchObject({ code: "ENOENT" });
  } finally { await rm(dir, { recursive: true, force: true }); }
});

it("retries transient backup pages and fails immediately on access errors", async () => {
  const load = vi.fn().mockResolvedValueOnce({ status: 521, error: { message: "<html>unavailable</html>" } })
    .mockResolvedValueOnce({ status: 200, error: null, data: [{ id: 1 }] });
  expect(await readBackupPage(load, 0)).toEqual([{ id: 1 }]); expect(load).toHaveBeenCalledTimes(2);
  const denied = vi.fn().mockResolvedValue({ status: 403, error: { message: "Access denied" } });
  await expect(readBackupPage(denied, 0)).rejects.toThrow("Access denied"); expect(denied).toHaveBeenCalledTimes(1);
  const unavailable = vi.fn().mockResolvedValue({ status: 521, error: { message: "<html>unavailable</html>" } });
  await expect(readBackupPage(unavailable, 0)).rejects.toThrow("HTTP 521"); expect(unavailable).toHaveBeenCalledTimes(3);
});

it("uses lexicographic cursors and quotes reserved characters in composite keys", () => {
  expect(backupCursorFilter(["id"], { id: "abc" })).toBe('id.gt."abc"');
  expect(backupCursorFilter(["artist_id", "effective_date"], { artist_id: 'a,"b', effective_date: "2026-10-18" }))
    .toBe('artist_id.gt."a,\\"b",and(artist_id.eq."a,\\"b",effective_date.gt."2026-10-18")');
  expect(() => backupCursorFilter(["id"], { id: null })).toThrow("non-null");
});
