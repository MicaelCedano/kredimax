import { describe, expect, it } from "vitest";
import { calculateFinancingQuote, downPaymentOptions, parseMoneyToCents, resolveDownPaymentPercent, resolveRecoveryEnabled } from "../src/modules/financing/calculator";

const defaults = {
  paymentDistribution: "frontloaded_v1" as const,
  installmentRounding: "cent" as const,
  salePrice: "10000.00",
  deviceCost: "10000.00",
  downPaymentPercent: "30.00",
  annualRatePercent: "48.000",
  legalExpenses: "1000.00",
  termMonths: 12,
  frequency: "monthly" as const,
  firstInstallmentDate: "2026-11-20",
  today: "2026-10-20",
};

describe("financing quote calculator", () => {
  it("applies 24 percent for six months at a 48 percent annual rate and exposes exact first/last dates", () => {
    const quote = calculateFinancingQuote({ ...defaults, termMonths: 6 });
    expect(quote.principal).toBe("7000.00");
    expect(quote.baseInterest).toBe("1680.00");
    expect(quote.firstInstallmentDate).toBe("2026-11-20");
    expect(quote.finalDueDate).toBe("2027-04-20");
    const fortnightly = calculateFinancingQuote({ ...defaults, termMonths: 6, frequency: "fortnightly" });
    expect(fortnightly.baseInterest).toBe("1680.00");
    expect(fortnightly.finalDueDate).toBe("2027-05-04");
    const monthEnd = calculateFinancingQuote({ ...defaults, termMonths: 6, firstInstallmentDate: "2027-01-31" });
    expect(monthEnd.finalDueDate).toBe("2027-06-30");
  });

  it("allows initial percentages through eighty percent, retains a configured legacy default and rejects other choices", () => {
    expect(downPaymentOptions("30.00")).toEqual(["30.00", "35.00", "40.00", "45.00", "50.00", "55.00", "60.00", "65.00", "70.00", "75.00", "80.00"]);
    expect(downPaymentOptions("32.50")).toContain("32.50");
    expect(resolveDownPaymentPercent("", "35.00")).toBe("35.00");
    expect(resolveDownPaymentPercent("40", "30.00")).toBe("40.00");
    for (const percent of ["50", "55", "60", "65", "70", "75", "80"]) {
      expect(resolveDownPaymentPercent(percent, "30.00")).toBe(`${percent}.00`);
    }
    expect(resolveDownPaymentPercent("32.50", "32.50")).toBe("32.50");
    for (const invalid of ["25", "52.50", "85", "0", "101", "30.001", "NaN"]) {
      expect(() => resolveDownPaymentPercent(invalid, "30.00")).toThrow();
    }
  });

  it.each(["30.00", "35.00", "40.00", "45.00", "50.00", "55.00", "60.00", "65.00", "70.00", "75.00", "80.00"])("updates down payment, financed capital, interest and notes for %s percent", (downPaymentPercent) => {
    const input = { ...defaults, salePrice: "35000.00", deviceCost: "35000.00", downPaymentPercent };
    const base = calculateFinancingQuote({ ...input, recoveryEnabled: false });
    const recovery = calculateFinancingQuote({ ...input, recoveryEnabled: true });
    expect(Number(base.downPayment)).toBe(35000 * Number(downPaymentPercent) / 100);
    expect(Number(base.principal)).toBe(35000 - Number(base.downPayment));
    expect(Number(base.baseInterest)).toBe(Number(base.principal) * 0.48);
    expect(recovery.totalCustomerPays).toBe(base.totalCustomerPays);
    expect(recovery.downPaymentPercent).toBe(downPaymentPercent);
    expect(recovery.recoveryMet).toBe(true);
    const original = calculateFinancingQuote({ ...input, downPaymentPercent: "30.00" });
    expect(Number(base.fixedInstallment)).toBeLessThanOrEqual(Number(original.fixedInstallment));
  });

  it("matches the required 12-month example without floating-point cents", () => {
    const quote = calculateFinancingQuote({ ...defaults, recoveryEnabled: true });
    expect(quote.downPayment).toBe("3000.00");
    expect(quote.principal).toBe("7000.00");
    expect(quote.baseInterest).toBe("3360.00");
    expect(quote.baseInstallment).toBe("946.67");
    expect(quote.recoveryInstallment).toBe("1166.67");
    expect(quote.fixedInstallment).toBe("1166.67");
    expect(quote.recoveryAtHalf).toBe("10000.02");
    expect(quote.totalCustomerPays).toBe("14360.04");
    expect(quote.proposedAdjustment).toBe("0.04");
    expect(quote.schedule).toHaveLength(12);
    expect(quote.schedule[0].dueDate).toBe("2026-11-20");
    expect(quote.schedule.at(-1)?.dueDate).toBe("2027-10-20");
    expect(quote.schedule.reduce((sum, row) => sum + parseMoneyToCents(row.amount), 0n)).toBe(1136004n);
    expect(quote.schedule.slice(0, 6).every((row) => row.amount === "1166.67")).toBe(true);
    expect(quote.schedule.slice(6).map((row) => row.amount)).toEqual(["726.67", "726.67", "726.67", "726.67", "726.67", "726.67"]);
    expect(quote.schedule.every((row) =>
      parseMoneyToCents(row.principal)
      + parseMoneyToCents(row.interest)
      + parseMoneyToCents(row.legalExpenses)
      + parseMoneyToCents(row.proposedAdjustment)
      === parseMoneyToCents(row.amount)
    )).toBe(true);
  });

  it("creates two payments per month for a fortnightly plan", () => {
    const quote = calculateFinancingQuote({ ...defaults, termMonths: 6, frequency: "fortnightly", recoveryEnabled: true });
    expect(quote.installmentCount).toBe(12);
    expect(quote.schedule).toHaveLength(12);
    expect(quote.schedule[1].dueDate).toBe("2026-12-05");
    expect(parseMoneyToCents(quote.recoveryAtHalf) >= parseMoneyToCents(quote.recoveryTarget)).toBe(true);
  });

  it("blocks an impossible recovery target without increasing the total or creating negative notes", () => {
    const quote = calculateFinancingQuote({ ...defaults, deviceCost: "20000.00", recoveryEnabled: true });
    expect(quote.recoveryMet).toBe(false);
    expect(quote.totalCustomerPays).toBe("14360.04");
    expect(quote.schedule.every((row) => parseMoneyToCents(row.amount) > 0n)).toBe(true);
  });

  it("uses the base installment and skips the midpoint gate when recovery is disabled", () => {
    const quote = calculateFinancingQuote({ ...defaults, recoveryEnabled: false });
    expect(quote.recoveryEnabled).toBe(false);
    expect(quote.fixedInstallment).toBe(quote.baseInstallment);
    expect(quote.fixedInstallment).toBe("946.67");
    expect(quote.recoveryAtHalf).toBe("8680.02");
    expect(quote.recoveryMet).toBe(true);
    expect(quote.schedule.every((row) => row.amount === quote.fixedInstallment)).toBe(true);
  });

  it("uses the shared disabled recovery default when the option is omitted", () => {
    const quote = calculateFinancingQuote(defaults);
    expect(quote.recoveryEnabled).toBe(false);
    expect(quote.fixedInstallment).toBe(quote.baseInstallment);
    expect(quote.recoveryMet).toBe(true);
  });

  it("keeps the base plan when it already meets recovery", () => {
    const base = calculateFinancingQuote({ ...defaults, termMonths: 24, recoveryEnabled: false });
    const enabled = calculateFinancingQuote({ ...defaults, termMonths: 24, recoveryEnabled: true });
    expect(enabled.schedule).toEqual(base.schedule);
    expect(enabled.totalCustomerPays).toBe(base.totalCustomerPays);
  });

  it("conserves totals and components for every term, frequency and cent distribution", () => {
    for (const termMonths of [3, 5, 6, 8, 12, 18, 24]) {
      for (const frequency of ["monthly", "fortnightly"] as const) {
        for (const salePrice of ["10000.00", "35000.13", "0.03"]) {
          const input = { ...defaults, termMonths, frequency, salePrice, deviceCost: salePrice };
          const base = calculateFinancingQuote({ ...input, recoveryEnabled: false });
          const quote = calculateFinancingQuote({ ...input, recoveryEnabled: true });
          expect(quote.totalCustomerPays).toBe(base.totalCustomerPays);
          expect(quote.proposedAdjustment).toBe(base.proposedAdjustment);
          for (const [field, total] of [["principal", quote.principal], ["interest", quote.baseInterest], ["legalExpenses", quote.legalExpenses], ["proposedAdjustment", quote.proposedAdjustment]] as const) {
            expect(quote.schedule.reduce((sum, row) => sum + parseMoneyToCents(row[field]), 0n)).toBe(parseMoneyToCents(total));
          }
          quote.schedule.forEach((row, index) => {
            expect(parseMoneyToCents(row.amount)).toBeGreaterThan(0n);
            expect(parseMoneyToCents(row.amount)).toBe(parseMoneyToCents(row.principal) + parseMoneyToCents(row.interest) + parseMoneyToCents(row.legalExpenses) + parseMoneyToCents(row.proposedAdjustment));
            if (index > 0) expect(parseMoneyToCents(row.amount)).toBeLessThanOrEqual(parseMoneyToCents(quote.schedule[index - 1].amount));
          });
          const half = quote.schedule.slice(0, Math.floor(quote.installmentCount / 2)).reduce((sum, row) => sum + parseMoneyToCents(row.amount), parseMoneyToCents(quote.downPayment));
          expect(half).toBe(parseMoneyToCents(quote.recoveryAtHalf));
          expect(quote.recoveryMet).toBe(true);
        }
      }
    }
  });

  it("resolves an absent or malformed historical recovery flag to the shared default", () => {
    expect(resolveRecoveryEnabled(undefined)).toBe(false);
    expect(resolveRecoveryEnabled(null)).toBe(false);
    expect(resolveRecoveryEnabled("true")).toBe(false);
    expect(resolveRecoveryEnabled(true)).toBe(true);
    expect(resolveRecoveryEnabled(false)).toBe(false);
  });

  it("rejects unsupported terms and malformed money", () => {
    expect(() => calculateFinancingQuote({ ...defaults, termMonths: 10 })).toThrow("plazo");
    expect(() => parseMoneyToCents("10.001")).toThrow("decimales");
  });

  it("uses an injected Santo Domingo business date instead of the machine clock", () => {
    expect(() => calculateFinancingQuote({ ...defaults, today: "2026-11-21" })).toThrow("fecha válida");
    expect(calculateFinancingQuote({ ...defaults, today: "2026-11-20" }).firstInstallmentDate).toBe("2026-11-20");
  });
});
