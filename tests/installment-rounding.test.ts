import { describe, expect, it } from "vitest";
import { calculateFinancingQuote, parseMoneyToCents as cents } from "../src/modules/financing/calculator";

const input = { paymentDistribution: "frontloaded_v1" as const, salePrice: "35000.00", deviceCost: "35000.00", downPaymentPercent: "30.00", annualRatePercent: "48.00", legalExpenses: "1000.00", termMonths: 8, frequency: "fortnightly" as const, recoveryEnabled: true, firstInstallmentDate: "2026-11-08", today: "2026-10-24" };

describe("installments rounded upward to RD$50", () => {
  it("matches the confirmed RD$3,100 / RD$1,150 example and exposes the total increase", () => {
    const quote = calculateFinancingQuote(input);
    expect(quote.installmentRounding).toBe("up_50");
    expect(quote.schedule.slice(0,8).map((row) => row.amount)).toEqual(Array(8).fill("3100.00"));
    expect(quote.schedule.slice(8).map((row) => row.amount)).toEqual(Array(8).fill("1150.00"));
    expect(quote.downPayment).toBe("10500.00");
    expect(quote.principal).toBe("24500.00");
    expect(quote.baseInterest).toBe("7840.00");
    expect(quote.totalCustomerPays).toBe("44500.00");
    expect(quote.roundingAdjustment).toBe("660.00");
    expect(quote.proposedAdjustment).toBe("660.00");
    expect(quote.adjustmentRequiresApproval).toBe(true);
  });

  it("leaves an exact multiple unchanged", () => {
    const quote = calculateFinancingQuote({ ...input, salePrice: "10000.00", deviceCost: "10000.00", annualRatePercent: "0", legalExpenses: "0", termMonths: 5, frequency: "monthly", recoveryEnabled: false });
    expect(quote.schedule.every((row) => row.amount === "1400.00")).toBe(true);
    expect(quote.roundingAdjustment).toBe("0.00");
    expect(quote.proposedAdjustment).toBe("0.00");
    expect(quote.adjustmentRequiresApproval).toBe(false);
  });

  for (const termMonths of [3,5,6,8,12]) {
    it(`reconciles every rounded payment and contractual component for ${termMonths} months`, () => {
      for (const frequency of ["monthly", "fortnightly"] as const) {
        for (const downPaymentPercent of ["30.00", "35.00", "40.00", "45.00", "50.00"]) {
          for (const recoveryEnabled of [true,false]) {
            for (const salePrice of ["0.03", "100.00", "35000.13", "100000.00"]) {
              const scenario = { ...input, termMonths, frequency, downPaymentPercent, recoveryEnabled, salePrice, deviceCost: salePrice };
              const original = calculateFinancingQuote({ ...scenario, installmentRounding: "cent" });
              const rounded = calculateFinancingQuote(scenario);
              for (const key of ["downPayment", "principal", "baseInterest", "legalExpenses", "firstInstallmentDate", "finalDueDate"] as const) expect(rounded[key]).toBe(original[key]);
              rounded.schedule.forEach((row, index) => {
                const amount = cents(row.amount);
                expect(amount).toBe(((cents(original.schedule[index].amount) + 4999n) / 5000n) * 5000n);
                expect(amount % 5000n).toBe(0n);
                expect(amount).toBeGreaterThanOrEqual(cents(original.schedule[index].amount));
                expect(row.dueDate).toBe(original.schedule[index].dueDate);
                expect(amount).toBe(cents(row.principal) + cents(row.interest) + cents(row.legalExpenses) + cents(row.proposedAdjustment));
              });
              const total = rounded.schedule.reduce((sum,row) => sum + cents(row.amount), cents(rounded.downPayment));
              expect(total).toBe(cents(rounded.totalCustomerPays));
              expect(cents(rounded.roundingAdjustment)).toBe(total - cents(original.totalCustomerPays));
              for (const [field,totalField] of [["principal","principal"],["interest","baseInterest"],["legalExpenses","legalExpenses"],["proposedAdjustment","proposedAdjustment"]] as const) expect(rounded.schedule.reduce((sum,row) => sum + cents(row[field]),0n)).toBe(cents(rounded[totalField]));
              const recovery = rounded.schedule.slice(0,Math.floor(rounded.installmentCount / 2)).reduce((sum,row) => sum + cents(row.amount),cents(rounded.downPayment));
              expect(recovery).toBe(cents(rounded.recoveryAtHalf));
              expect(rounded.recoveryMet).toBe(!recoveryEnabled || recovery >= cents(rounded.recoveryTarget));
            }
          }
        }
      }
    });
  }
});
