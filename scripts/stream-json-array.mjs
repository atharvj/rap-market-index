import { createHash } from "node:crypto";
import { writeFile, rm } from "node:fs/promises";

// writeFile consumes this iterable with backpressure. Neither the table nor its
// serialized representation is ever assembled into one in-memory array/string.
export async function writeJsonArray(path, pages) {
  let rowCount = 0;
  const hash = createHash("sha256");
  async function* chunks() {
    yield "[";
    for await (const page of pages) {
      for (const row of page) {
        yield `${rowCount++ ? "," : ""}\n${JSON.stringify(row)}`;
      }
    }
    yield "\n]\n";
  }
  async function* hashedChunks() {
    for await (const chunk of chunks()) { hash.update(chunk); yield chunk; }
  }
  try {
    await writeFile(path, hashedChunks(), { encoding: "utf8", mode: 0o600 });
    return { rowCount, sha256: hash.digest("hex") };
  } catch (error) {
    await rm(path, { force: true });
    throw error;
  }
}

// Retrying a read-only page cannot publish or duplicate backup rows: a page is
// yielded only after its successful response. Authorization/schema errors fail.
export async function readBackupPage(load, retryDelayMs = 1000) {
  for (let attempt = 0; ; attempt++) {
    const result = await load();
    if (!result.error) return result.data ?? [];
    const transient = result.status >= 500 || result.status === 0 || result.error.code === "57014";
    if (!transient || attempt >= 2) {
      const message = /<html|<!doctype/i.test(result.error.message ?? "")
        ? `Database endpoint unavailable (HTTP ${result.status}).` : result.error.message;
      throw new Error(message || "Database backup read failed.");
    }
    await new Promise(resolve => setTimeout(resolve, retryDelayMs * (attempt + 1)));
  }
}
