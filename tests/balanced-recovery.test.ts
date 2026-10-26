import { describe, expect, it } from "vitest";
import { calculateFinancingQuote, parseMoneyToCents as cents } from "../src/modules/financing/calculator";

const base = { salePrice: "35000.00", deviceCost: "35000.00", downPaymentPercent: "30.00", annualRatePercent: "48.00", legalExpenses: "1000.00", firstInstallmentDate: "2026-11-23", today: "2026-10-24" };

describe("balanced recovery capped at 20 percent", () => {
  it("matches the approved six-month monthly example without increasing the total", () => {
    const q = calculateFinancingQuote({ ...base, termMonths: 6, frequency: "monthly", recoveryEnabled: true });
    expect(q.paymentDistribution).toBe("balanced_20_v1");
    expect(q.recoveryMaximumDifferencePercent).toBe("20.00");
    expect(q.schedule.map((row) => row.amount)).toEqual(["5700.00","5700.00","5700.00","4800.00","4800.00","4800.00"]);
    expect(q.totalCustomerPays).toBe("42000.00");
    expect(q.proposedAdjustment).toBe("120.00");
  });

  for (const termMonths of [3,5,6,8,12]) {
    it(`preserves totals, allocations, RD$50 steps and the actual 20% cap for ${termMonths} months`, () => {
      for (const frequency of ["monthly","fortnightly"] as const) {
        for (const downPaymentPercent of ["30.00","35.00","40.00","45.00","50.00"]) {
          for (const salePrice of ["0.03","100.00","35000.13","100000.00"]) {
            const scenario = { ...base, termMonths, frequency, downPaymentPercent, salePrice, deviceCost: salePrice };
            const balanced = calculateFinancingQuote({ ...scenario, recoveryEnabled: true });
            const level = calculateFinancingQuote({ ...scenario, recoveryEnabled: false });
            const historicalLevel = calculateFinancingQuote({ ...scenario, recoveryEnabled: true, paymentDistribution: "level_v1" });
            expect(level.schedule).toEqual(historicalLevel.schedule);
            expect(balanced.totalCustomerPays).toBe(level.totalCustomerPays);
            expect(balanced.roundingAdjustment).toBe(level.roundingAdjustment);
            expect(balanced.proposedAdjustment).toBe(level.proposedAdjustment);
            const amounts = balanced.schedule.map((row) => cents(row.amount));
            const highest = amounts.reduce((a,b) => a>b?a:b), lowest = amounts.reduce((a,b) => a<b?a:b);
            expect(highest * 5n).toBeLessThanOrEqual(lowest * 6n);
            expect(highest).toBeGreaterThanOrEqual(cents(level.fixedInstallment));
            amounts.forEach((amount,index) => {
              expect(amount).toBeGreaterThan(0n);
              expect(amount % 5000n).toBe(0n);
              if (index > 0) expect(amount).toBeLessThanOrEqual(amounts[index-1]);
              const row = balanced.schedule[index];
              expect(row.dueDate).toBe(level.schedule[index].dueDate);
              expect(amount).toBe(cents(row.principal)+cents(row.interest)+cents(row.legalExpenses)+cents(row.proposedAdjustment));
            });
            expect(amounts.reduce((a,b)=>a+b,cents(balanced.downPayment))).toBe(cents(balanced.totalCustomerPays));
            for (const [field,totalField] of [["principal","principal"],["interest","baseInterest"],["legalExpenses","legalExpenses"],["proposedAdjustment","proposedAdjustment"]] as const) expect(balanced.schedule.reduce((sum,row)=>sum+cents(row[field]),0n)).toBe(cents(balanced[totalField]));
            const horizon = Math.min(amounts.length,6*(frequency === "monthly"?1:2));
            const recovered = amounts.slice(0,horizon).reduce((a,b)=>a+b,cents(balanced.downPayment));
            expect(cents(balanced.recoveryAtSixMonths)).toBe(recovered);
            expect(balanced.recoveryMet).toBe(recovered >= cents(balanced.recoveryTarget));
          }
        }
      }
    });
  }
});
