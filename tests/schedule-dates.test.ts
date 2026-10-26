import { describe, expect, it } from "vitest";
import { calculateFinancingQuote } from "../src/modules/financing/calculator";
import { firstPaymentDate, quoteDatesFromApproval } from "../src/modules/financing/schedule-dates";

describe("approval-based payment dates", () => {
  it.each([
    ["2026-10-24", "fortnightly", "2026-11-08"],
    ["2026-10-24", "monthly", "2026-11-23"],
    ["2026-12-24", "fortnightly", "2027-01-08"],
    ["2028-02-01", "monthly", "2028-03-02"],
  ] as const)("starts %s %s payments on %s", (approval, frequency, expected) => {
    expect(firstPaymentDate(approval, frequency)).toBe(expected);
  });

  it.each(["monthly", "fortnightly"] as const)("moves a delayed %s approval without changing money or the original proposal", (frequency) => {
    const original = calculateFinancingQuote({ salePrice: "35000.13", deviceCost: "35000.13", downPaymentPercent: "35.00", annualRatePercent: "48.00", legalExpenses: "1000.00", termMonths: 6, frequency, firstInstallmentDate: "2026-10-01", today: "2026-09-01", recoveryEnabled: true });
    const before = structuredClone(original);
    const approved = quoteDatesFromApproval(original, "2026-10-24");
    expect(original).toEqual(before);
    expect(approved.firstInstallmentDate).toBe(frequency === "monthly" ? "2026-11-23" : "2026-11-08");
    expect(approved.finalDueDate).toBe(frequency === "monthly" ? "2027-04-23" : "2027-04-22");
    const withoutDates = (quote: typeof original) => ({ ...quote, firstInstallmentDate: "", finalDueDate: "", schedule: quote.schedule.map((row) => ({ ...row, dueDate: "" })) });
    expect(withoutDates(approved)).toEqual(withoutDates(before));
  });

  it("clamps monthly installments at month end and then restores the original day", () => {
    const quote = { frequency: "monthly" as const, firstInstallmentDate: "2020-01-01", finalDueDate: "2020-03-01", schedule: [1,2,3].map((sequence) => ({ sequence, dueDate: "2020-01-01" })) };
    expect(quoteDatesFromApproval(quote, "2027-01-01").schedule.map((row) => row.dueDate)).toEqual(["2027-01-31", "2027-02-28", "2027-03-31"]);
  });
});
