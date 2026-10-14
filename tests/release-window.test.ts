import { describe, expect, it } from "vitest";
import { loadReleaseWindowStatus } from "@/server/market/release-window";
function database({ active = ["a", "b"], closes = ["a", "b"], run = true, failure = "" } = {}) {
  return { from(table: string) {
    let ids: string[] | null = null;
    const builder = {
      select: () => builder, eq: () => builder, order: () => builder,
      in(_column: string, values: string[]) { ids = values; return builder; },
      maybeSingle: async () => ({ data: run ? { status: "succeeded", source: "core" } : null, error: null }),
      range: async (from: number, to: number) => ({ data: active.slice(from, to + 1).map(id => ({ id })), error: failure === table ? { message: "Failed" } : null }),
      then(resolve: (value: unknown) => unknown) {
        return Promise.resolve({ count: closes.filter(id => !ids || ids.includes(id)).length, error: failure === table ? { message: "Failed" } : null }).then(resolve);
      }
    };
    return builder;
  } } as never;
}
const now = new Date("2026-10-13T12:00:00Z");
describe("daily opening coverage", () => {
  it("requires a current close for every active artist", async () => {
    expect((await loadReleaseWindowStatus(database(), now)).ready).toBe(true);
  });
  it("cannot replace a missing active close with an inactive artist's close", async () => {
    expect((await loadReleaseWindowStatus(database({ closes: ["a", "inactive"] }), now)).ready).toBe(false);
  });
  it("does not let extra inactive closes prevent a complete active roster from opening", async () => {
    expect((await loadReleaseWindowStatus(database({ closes: ["a", "b", "inactive"] }), now)).ready).toBe(true);
  });
  it("requires a successful daily run and a nonempty active roster", async () => {
    expect((await loadReleaseWindowStatus(database({ run: false }), now)).ready).toBe(false);
    expect((await loadReleaseWindowStatus(database({ active: [] }), now)).ready).toBe(false);
  });
  it.each(["artists", "price_history"])("fails closed when %s coverage is unavailable", async failure => {
    await expect(loadReleaseWindowStatus(database({ failure }), now)).rejects.toThrow();
  });
  it("checks rosters beyond the first database page", async () => {
    const active = Array.from({ length: 1001 }, (_, index) => `artist-${index}`);
    expect((await loadReleaseWindowStatus(database({ active, closes: active.slice(0, -1) }), now)).ready).toBe(false);
  });
});
