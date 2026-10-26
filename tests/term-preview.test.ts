import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FinancingPeriodSelector } from "../src/modules/financing/period-selector";
import { calculateFinancingQuote } from "../src/modules/financing/calculator";
import { formatDop } from "../src/lib/format-money";

const allowedTerms = [3, 5, 6, 8, 12];
const input = { salePrice: "35000.10", deviceCost: "35000.10", downPaymentPercent: "30.00", annualRatePercent: "48.000", legalExpenses: "1000.00", termMonths: 12, firstInstallmentDate: "2026-11-20", today: "2026-10-24", recoveryTargetPercent: "100.00" };

describe("term card payment previews", () => {
  for (const frequency of ["monthly", "fortnightly"] as const) {
    for (const recoveryEnabled of [true, false]) {
      it(`shows the exact schedule for every ${frequency} term with recovery=${recoveryEnabled}`, () => {
        const quote = calculateFinancingQuote({ ...input, frequency, recoveryEnabled });
        const markup = renderToStaticMarkup(createElement(FinancingPeriodSelector, { allowedTerms, termMonths: 12, frequency, onTermChange: () => {}, onFrequencyChange: () => {}, quote, today: input.today, recoveryTargetPercent: input.recoveryTargetPercent }));
        for (const termMonths of allowedTerms) {
          const card = markup.split("</label>").find((part) => part.includes('name="termMonths"') && part.includes(`value="${termMonths}"`));
          expect(card).toBeDefined();
          const expected = calculateFinancingQuote({ ...input, termMonths, frequency, recoveryEnabled });
          for (const amount of new Set(expected.schedule.map((row) => row.amount))) expect(card).toContain(formatDop(amount));
        }
        expect(markup).toContain("km-choice-detailed");
        expect(markup).toContain('value="12"');
      });
    }
  }
  it("does not invent payment amounts without a valid quote", () => {
    const markup = renderToStaticMarkup(createElement(FinancingPeriodSelector, { allowedTerms, termMonths: 12, frequency: "monthly", onTermChange: () => {}, onFrequencyChange: () => {}, quote: null, today: input.today, recoveryTargetPercent: input.recoveryTargetPercent }));
    expect(markup).toContain("Completa el precio");
    expect(markup).not.toContain("km-term-amount");
  });
});
