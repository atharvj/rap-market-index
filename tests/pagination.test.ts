import { describe, expect, it } from "vitest";
import { loadAllPages } from "@/lib/pagination";

describe("loadAllPages", () => {
  it("loads every row when a backend caps each response", async () => {
    const source = Array.from({ length: 2_305 }, (_, index) => index);
    const requestedRanges: Array<[number, number]> = [];

    const rows = await loadAllPages(
      async (from, to) => {
        requestedRanges.push([from, to]);
        return source.slice(from, to + 1);
      },
      { pageSize: 1_000 }
    );

    expect(rows).toEqual(source);
    expect(requestedRanges).toEqual([
      [0, 999],
      [1_000, 1_999],
      [2_000, 2_999]
    ]);
  });

  it("rejects invalid limits instead of looping unpredictably", async () => {
    await expect(loadAllPages(async () => [], { pageSize: 0 })).rejects.toThrow(
      "Pagination limits must be positive integers."
    );
  });
});
