import { describe, expect, it } from "vitest";
import { sanitizeSearchTerm } from "../src/lib/validation/search-term";

describe("sanitizeSearchTerm", () => {
  it("preserves common names, identifiers, and spaces", () => {
    expect(sanitizeSearchTerm("  José Pérez 2026-A  ")).toBe("José Pérez 2026-A");
  });

  it("strips PostgREST filter grammar and punctuation before interpolation", () => {
    expect(sanitizeSearchTerm("x%,(select.eq.any)\"\\.ilike.*%" )).toBe("xselecteqanyilike");
  });

  it("collapses whitespace and caps the search term", () => {
    expect(sanitizeSearchTerm("  Ana\n   Pérez ")).toBe("Ana Pérez");
    expect(sanitizeSearchTerm("a".repeat(120))).toHaveLength(80);
  });
});
