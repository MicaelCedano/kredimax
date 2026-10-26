import { describe, expect, it } from "vitest";
import { newFinancingTerms } from "../src/modules/financing/term-policy";

describe("new financing term policy", () => {
  it("offers only 3, 5, 6, 8 and 12 months by default", () => {
    expect(newFinancingTerms()).toEqual([3, 5, 6, 8, 12]);
  });
  it("removes long terms from legacy settings without changing the stored input", () => {
    const stored = [3, 5, 6, 8, 12, 18, 24];
    expect(newFinancingTerms(stored)).toEqual([3, 5, 6, 8, 12]);
    expect(stored).toEqual([3, 5, 6, 8, 12, 18, 24]);
  });
  it("preserves the tenant's configured subset", () => {
    expect(newFinancingTerms([5, 8, 24])).toEqual([5, 8]);
    expect(newFinancingTerms([])).toEqual([]);
  });
});
