import { describe, expect, it } from "vitest";
import { parseReceiptFilters, receiptListHref } from "@/modules/payments/receipt-filters";

describe("receipt directory filters", () => {
  it("starts with all receipts and validates actual calendar dates", () => {
    expect(parseReceiptFilters({}).invalid).toBe(false);
    expect(parseReceiptFilters({ from: "2026-02-29" }).invalid).toBe(true);
    expect(parseReceiptFilters({ from: "2028-02-29", to: "2028-03-01" }).invalid).toBe(false);
    expect(parseReceiptFilters({ from: "2026-11-01", to: "2026-10-01" }).invalid).toBe(true);
  });
  it("rejects unrecognized values instead of silently broadening the financial report", () => {
    for (const query of [{ status: "deleted" }, { type: "loan" }, { method: "wire" }, { branch: "bad-id" }, { customer: "bad-id" }]) expect(parseReceiptFilters(query).invalid).toBe(true);
  });
  it("preserves all filters when changing pages and encodes the search term", () => {
    const filters = parseReceiptFilters({ q: " José & Ana ", status: "reversed", type: "installment", method: "card", customer: "81000000-0000-4000-8000-000000000001", branch: "81000000-0000-4000-8000-000000000002", from: "2026-10-01", to: "2026-10-31" });
    const url = new URL(receiptListHref(filters, 2), "http://localhost");
    expect(filters.invalid).toBe(false);
    expect(url.searchParams.get("q")).toBe("José & Ana");
    expect(url.searchParams.get("customer")).toBe(filters.customer);
    expect(url.searchParams.get("branch")).toBe(filters.branch);
    expect(url.searchParams.get("status")).toBe("reversed");
    expect(url.searchParams.get("to")).toBe("2026-10-31");
    expect(url.searchParams.get("page")).toBe("2");
    expect(parseReceiptFilters({ page: "-1" }).page).toBe(1);
  });
});
