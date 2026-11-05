import { expect, it } from "vitest";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { writeJsonArray } from "../scripts/stream-json-array.mjs";

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
