import { describe, expect, it } from "vitest";
import { calculateFinancingQuote, parseMoneyToCents as cents } from "../src/modules/financing/calculator";
import { semesterInstallments } from "../src/modules/financing/installment-groups";

const base = { paymentDistribution: "level_v1" as const, salePrice: "35000.00", deviceCost: "35000.00", downPaymentPercent: "30.00", annualRatePercent: "48.00", legalExpenses: "1000.00", firstInstallmentDate: "2026-11-23", today: "2026-10-24" };

describe("level payments and advisory six-month recovery", () => {
  it.each([[3,"fortnightly","4750.00",6],[6,"monthly","5250.00",6],[12,"monthly","3150.00",12]] as const)("uses %s-month %s payments of %s", (termMonths,frequency,amount,count) => {
    const quote = calculateFinancingQuote({ ...base, termMonths, frequency, recoveryEnabled: true });
    expect(quote.paymentDistribution).toBe("level_v1");
    expect(quote.schedule.map((row) => row.amount)).toEqual(Array(count).fill(amount));
    if (termMonths === 12) {
      expect(quote.recoveryAtSixMonths).toBe("29400.00");
      expect(quote.recoveryAtHalf).toBe("29400.00");
      expect(quote.recoveryMet).toBe(false);
    }
  });

  it.each([3,5,6,8,12])("reconciles every %s-month quote without front-loading or a mandatory recovery target", (termMonths) => {
    for (const frequency of ["monthly","fortnightly"] as const) {
      for (const downPaymentPercent of ["30.00","35.00","40.00","45.00","50.00"]) {
        for (const salePrice of ["0.03","100.00","35000.13","100000.00"]) {
          const scenario = { ...base, termMonths, frequency, downPaymentPercent, salePrice, deviceCost: salePrice };
          const withReference = calculateFinancingQuote({ ...scenario, recoveryEnabled: true });
          const withoutReference = calculateFinancingQuote({ ...scenario, recoveryEnabled: false });
          expect(withReference.schedule).toEqual(withoutReference.schedule);
          expect(withReference.totalCustomerPays).toBe(withoutReference.totalCustomerPays);
          expect(new Set(withReference.schedule.map((row) => row.amount)).size).toBe(1);
          expect(cents(withReference.fixedInstallment) % 5000n).toBe(0n);
          const total = withReference.schedule.reduce((sum,row) => sum + cents(row.amount),cents(withReference.downPayment));
          expect(total).toBe(cents(withReference.totalCustomerPays));
          for (const [field,totalField] of [["principal","principal"],["interest","baseInterest"],["legalExpenses","legalExpenses"],["proposedAdjustment","proposedAdjustment"]] as const) expect(withReference.schedule.reduce((sum,row) => sum + cents(row[field]),0n)).toBe(cents(withReference[totalField]));
          const horizon = Math.min(withReference.installmentCount,6 * (frequency === "monthly" ? 1 : 2));
          const actualRecovery = withReference.schedule.slice(0,horizon).reduce((sum,row) => sum + cents(row.amount),cents(withReference.downPayment));
          expect(cents(withReference.recoveryAtSixMonths)).toBe(actualRecovery);
          expect(withReference.recoveryMet).toBe(actualRecovery >= cents(withReference.recoveryTarget));
          const semesters = semesterInstallments(withReference.schedule,frequency);
          expect(semesters.length).toBe(termMonths <= 6 ? 1 : 2);
          expect(semesters[0].groups.at(-1)?.last).toBe(horizon);
        }
      }
    }
  });

  it("can still reproduce the prior front-loaded policy for a saved quote", () => {
    const previous = calculateFinancingQuote({ ...base, termMonths: 6, frequency: "monthly", recoveryEnabled: true, paymentDistribution: "frontloaded_v1" });
    expect(previous.schedule.slice(0,3).map((row) => row.amount)).toEqual(Array(3).fill("8200.00"));
    expect(previous.schedule.slice(3).map((row) => row.amount)).toEqual(Array(3).fill("2300.00"));
    expect(calculateFinancingQuote({ ...base, termMonths: 6, frequency: "monthly", recoveryEnabled: true }).fixedInstallment).toBe("5250.00");
  });
});
