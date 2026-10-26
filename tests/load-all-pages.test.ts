import { describe, expect, it } from "vitest";
import { loadAllPages } from "../src/lib/pagination/load-all-pages";

describe("loadAllPages", () => {
  it("loads every row without assuming the first page is the complete result", async () => {
    const rows = Array.from({ length: 1_203 }, (_, id) => ({ id }));
    const ranges: [number, number][] = [];
    const result = await loadAllPages(async (from, to) => {
      ranges.push([from, to]);
      return { data: rows.slice(from, to + 1), error: null };
    }, 500);

    expect(result).toEqual(rows);
    expect(ranges).toEqual([[0, 499], [500, 999], [1_000, 1_499]]);
  });

  it("propagates query failures instead of presenting an incomplete list", async () => {
    const failure = new Error("membership query failed");
    await expect(loadAllPages(async () => ({ data: null, error: failure }))).rejects.toBe(failure);
  });

  it("rejects invalid page sizes", async () => {
    await expect(loadAllPages(async () => ({ data: [], error: null }), 0)).rejects.toThrow(RangeError);
  });
});
