import { describe, expect, it } from "vitest";
import { getContractBreakdownBySequence } from "../src/lib/contract-breakdown";

describe("contract installment breakdown", () => {
  const installments = [
    { sequence: 1, amount_due: "101.00" },
    { sequence: 2, amount_due: "101.00" },
  ];
  const terms = {
    schedule: [
      { sequence: 1, amount: "101.00", principal: "50.00", interest: "30.00", legalExpenses: "10.00", proposedAdjustment: "11.00" },
      { sequence: 2, amount: "101.00", principal: "50.00", interest: "30.00", legalExpenses: "10.00", proposedAdjustment: "11.00" },
    ],
  };

  it("returns contractual components when the snapshot exactly matches each stored installment", () => {
    const breakdown = getContractBreakdownBySequence(terms, installments);
    expect(breakdown.get(1)).toEqual({ principal: 5000n, interest: 3000n, legalExpenses: 1000n, adjustment: 1100n });
    expect(breakdown.get(2)).toEqual({ principal: 5000n, interest: 3000n, legalExpenses: 1000n, adjustment: 1100n });
  });

  it("hides the entire breakdown if any component no longer reconciles to the installment", () => {
    const tamperedTerms = { schedule: [...terms.schedule.slice(0, 1), { ...terms.schedule[1], principal: "49.99" }] };
    expect(getContractBreakdownBySequence(tamperedTerms, installments).size).toBe(0);
  });

  it("hides historical or malformed snapshots instead of recalculating components", () => {
    expect(getContractBreakdownBySequence({ schedule: [{ sequence: 1, amount: "101.00" }] }, installments).size).toBe(0);
    expect(getContractBreakdownBySequence({ schedule: [] }, installments).size).toBe(0);
  });
});
