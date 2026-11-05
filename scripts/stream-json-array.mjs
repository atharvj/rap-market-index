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
