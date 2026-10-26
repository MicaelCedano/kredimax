import { describe, expect, it } from "vitest";
import { calculateFinancingQuote } from "@/modules/financing/calculator";
import {
  compareRequestedDeviceWithCapacity,
  DEFAULT_CREDIT_POLICY_SETTINGS,
  EMPTY_PAYMENT_HISTORY,
  evaluateCustomerCredit,
  resolveCreditPolicy,
  type CreditFactorBreakdown,
  type CustomerFinancialInput,
} from "@/modules/credit-evaluation/engine";

function getFactor(factors: CreditFactorBreakdown[], key: CreditFactorBreakdown["key"]) {
  const found = factors.find((f) => f.key === key);
  if (!found) throw new Error(`Factor ${key} not found`);
  return found;
}

const BASE_VERIFIED_CUSTOMER: CustomerFinancialInput = {
  identityNumber: "00112345678",
  phone: "8095551234",
  address: "Av. Winston Churchill 102, Santo Domingo",
  occupation: "Analista Contable",
  employmentType: "salaried",
  employer: "Claro Dominicana",
  employmentTenureMonths: 36,
  declaredMonthlyIncome: "45000.00",
  verifiedMonthlyIncome: "45000.00",
  otherVerifiableIncome: "5000.00",
  essentialMonthlyExpenses: "15000.00",
  existingMonthlyDebts: "4000.00",
  verifiedMonthlyDebts: "4000.00",
  dependentsCount: 1,
  housingType: "own",
  monthlyRentExpense: "0.00",
  referenceName: "María Pérez",
  referencePhone: "8095559876",
  workReferenceName: "Carlos Gómez",
  workReferencePhone: "8095554321",
  incomeVerificationStatus: "verified",
  identityVerificationStatus: "verified",
  employmentVerificationStatus: "verified",
  financialDataConsent: true,
};

describe("KrediMax Internal Credit Evaluation & Capacity Engine", () => {
  it("returns 'incomplete' and 'unrated' when no monthly income is provided, never inventing income or score", () => {
    const result = evaluateCustomerCredit(
      {
        ...BASE_VERIFIED_CUSTOMER,
        declaredMonthlyIncome: null,
        verifiedMonthlyIncome: null,
        otherVerifiableIncome: null,
      },
      EMPTY_PAYMENT_HISTORY,
    );

    expect(result.status).toBe("incomplete");
    expect(result.totalScore).toBeNull();
    expect(result.riskLevel).toBe("unrated");
    expect(result.monthlyPaymentCapacity).toBe("0.00");
    expect(result.recommendedMaxPrincipal).toBe("0.00");
    expect(result.recommendedMaxSalePrice).toBe("0.00");
    expect(result.missingFields.length).toBeGreaterThan(0);
  });

  it("handles absence of KrediMax history neutrally without confusing it with delinquency or awarding maximum history points", () => {
    const newCustomerResult = evaluateCustomerCredit(BASE_VERIFIED_CUSTOMER, EMPTY_PAYMENT_HISTORY);
    const historyFactor = getFactor(newCustomerResult.factors, "paymentHistory");

    expect(newCustomerResult.status).toBe("complete");
    // History factor weight is 30; a new customer with 0 loans and 0 paid installments receives neutral 50% (15 pts)
    expect(historyFactor.score).toBe(15);
    expect(historyFactor.maxScore).toBe(30);
    expect(newCustomerResult.totalScore).toBeGreaterThanOrEqual(70);
    expect(["low", "moderate_low"]).toContain(newCustomerResult.riskLevel);
  });

  it("rewards proven KrediMax payment history with higher score than a customer without history", () => {
    const newCustomer = evaluateCustomerCredit(BASE_VERIFIED_CUSTOMER, EMPTY_PAYMENT_HISTORY);
    const provenCustomer = evaluateCustomerCredit(BASE_VERIFIED_CUSTOMER, {
      ...EMPTY_PAYMENT_HISTORY,
      completedLoansCount: 2,
      paidInstallmentsCount: 24,
    });

    const provenHistoryFactor = getFactor(provenCustomer.factors, "paymentHistory");
    expect(provenHistoryFactor.score).toBe(30);
    expect(provenCustomer.totalScore!).toBeGreaterThan(newCustomer.totalScore!);
    expect(provenCustomer.riskLevel).toBe("low");
  });

  it("penalizes customers with overdue installments / arrears and reduces their score and capacity", () => {
    const delinquentResult = evaluateCustomerCredit(BASE_VERIFIED_CUSTOMER, {
      activeLoansCount: 1,
      completedLoansCount: 0,
      activePrincipalBalance: "18500.00",
      activeMonthlyObligation: "2800.00",
      paidInstallmentsCount: 2,
      overdueInstallmentsCount: 3,
      maxDaysPastDue: 65,
    });

    const historyFactor = getFactor(delinquentResult.factors, "paymentHistory");
    expect(historyFactor.score).toBe(0);
    expect(delinquentResult.negativeDrivers.some((d) => d.includes("atrasada") || d.includes("mora"))).toBe(true);
    expect(Number(delinquentResult.monthlyPaymentCapacity)).toBeLessThan(
      Number(evaluateCustomerCredit(BASE_VERIFIED_CUSTOMER, EMPTY_PAYMENT_HISTORY).monthlyPaymentCapacity),
    );
  });

  it("handles insufficient income and debts exceeding income by setting capacity and recommended limit to RD$0.00", () => {
    const overIndebtedResult = evaluateCustomerCredit(
      {
        ...BASE_VERIFIED_CUSTOMER,
        declaredMonthlyIncome: "18000.00",
        verifiedMonthlyIncome: "18000.00",
        otherVerifiableIncome: "0.00",
        essentialMonthlyExpenses: "12000.00",
        existingMonthlyDebts: "19500.00",
        verifiedMonthlyDebts: "19500.00",
        housingType: "rented",
        monthlyRentExpense: "6000.00",
      },
      EMPTY_PAYMENT_HISTORY,
    );

    expect(overIndebtedResult.monthlyPaymentCapacity).toBe("0.00");
    expect(overIndebtedResult.recommendedMaxPrincipal).toBe("0.00");
    expect(overIndebtedResult.recommendedMaxSalePrice).toBe("0.00");
    expect(getFactor(overIndebtedResult.factors, "paymentCapacity").score).toBe(0);
    expect(getFactor(overIndebtedResult.factors, "currentIndebtedness").score).toBe(0);
    expect(overIndebtedResult.riskLevel).toBe("high");
  });

  it("accounts for simultaneous active financings in KrediMax when computing indebtedness and available capacity", () => {
    const singleLoan = evaluateCustomerCredit(BASE_VERIFIED_CUSTOMER, {
      ...EMPTY_PAYMENT_HISTORY,
      activeLoansCount: 1,
      activePrincipalBalance: "12000.00",
      activeMonthlyObligation: "2200.00",
      paidInstallmentsCount: 8,
    });

    const simultaneousLoans = evaluateCustomerCredit(BASE_VERIFIED_CUSTOMER, {
      ...EMPTY_PAYMENT_HISTORY,
      activeLoansCount: 2,
      activePrincipalBalance: "28000.00",
      activeMonthlyObligation: "6500.00",
      paidInstallmentsCount: 8,
    });

    expect(Number(simultaneousLoans.monthlyPaymentCapacity)).toBeLessThan(Number(singleLoan.monthlyPaymentCapacity));
    expect(getFactor(simultaneousLoans.factors, "currentIndebtedness").score).toBeLessThan(
      getFactor(singleLoan.factors, "currentIndebtedness").score,
    );
  });

  it("calculates recommended principal, sale price, and down payment matching KrediMax's exact simple-interest calculator", () => {
    const evaluation = evaluateCustomerCredit(BASE_VERIFIED_CUSTOMER, EMPTY_PAYMENT_HISTORY);

    expect(Number(evaluation.monthlyPaymentCapacity)).toBeGreaterThan(0);
    expect(Number(evaluation.recommendedMaxSalePrice)).toBeGreaterThan(0);

    const quote = calculateFinancingQuote({
      salePrice: evaluation.recommendedMaxSalePrice,
      deviceCost: evaluation.recommendedMaxSalePrice,
      downPaymentPercent: evaluation.capacityBreakdown.downPaymentPercent,
      annualRatePercent: evaluation.capacityBreakdown.annualRatePercent,
      legalExpenses: evaluation.capacityBreakdown.legalExpenses,
      termMonths: evaluation.recommendedTermMonths,
      frequency: "monthly",
      firstInstallmentDate: "2026-11-15",
      recoveryEnabled: evaluation.policySnapshot.recoveryEnabled,
    });

    expect(quote.principal).toBe(evaluation.recommendedMaxPrincipal);
    expect(quote.downPayment).toBe(evaluation.recommendedDownPayment);
    expect(quote.fixedInstallment).toBe(evaluation.recommendedInstallment);
    expect(Number(quote.fixedInstallment)).toBeLessThanOrEqual(Number(evaluation.monthlyPaymentCapacity));
  });

  it.each([3, 5, 6, 8, 12])("fits the level installment within capacity without requiring full recovery for a %i-month term", (termMonths) => {
    const policy = resolveCreditPolicy({ defaultEvaluationTermMonths: termMonths }, { recoveryEnabled: true });
    const evaluation = evaluateCustomerCredit(BASE_VERIFIED_CUSTOMER, EMPTY_PAYMENT_HISTORY, policy);
    const quote = calculateFinancingQuote({
      salePrice: evaluation.recommendedMaxSalePrice,
      deviceCost: evaluation.recommendedMaxSalePrice,
      downPaymentPercent: policy.downPaymentPercent,
      annualRatePercent: policy.annualRatePercent,
      legalExpenses: policy.legalExpenses,
      termMonths,
      frequency: "monthly",
      firstInstallmentDate: "2026-11-15",
      today: "2026-10-24",
      recoveryEnabled: true,
    });
    expect(Number(quote.fixedInstallment)).toBeLessThanOrEqual(Number(evaluation.monthlyPaymentCapacity));
    expect(quote.fixedInstallment).toBe(evaluation.recommendedInstallment);
    expect(quote.recoveryMet).toBe(Number(quote.recoveryAtSixMonths) >= Number(quote.recoveryTarget));
  });

  it.each([false,true])("keeps rounded recommendations within a fractional income capacity with recovery=%s", (recoveryEnabled) => {
    for (const defaultEvaluationTermMonths of [3,5,6,8,12]) {
      const policy = resolveCreditPolicy({ defaultEvaluationTermMonths, maxDebtToIncomePercent: "33.33" }, { recoveryEnabled });
      const evaluation = evaluateCustomerCredit({ ...BASE_VERIFIED_CUSTOMER, verifiedMonthlyIncome: "50000.37", declaredMonthlyIncome: "50000.37" }, EMPTY_PAYMENT_HISTORY, policy);
      expect(Number(evaluation.recommendedMaxSalePrice)).toBeGreaterThan(0);
      const quote = calculateFinancingQuote({ salePrice: evaluation.recommendedMaxSalePrice, deviceCost: evaluation.recommendedMaxSalePrice, downPaymentPercent: policy.downPaymentPercent, annualRatePercent: policy.annualRatePercent, legalExpenses: policy.legalExpenses, termMonths: defaultEvaluationTermMonths, frequency: "monthly", firstInstallmentDate: "2026-11-23", today: "2026-10-24", recoveryEnabled });
      expect(quote.fixedInstallment).toBe(evaluation.recommendedInstallment);
      expect(Number(quote.fixedInstallment) % 50).toBe(0);
      expect(Number(quote.fixedInstallment)).toBeLessThanOrEqual(Number(evaluation.monthlyPaymentCapacity));
    }
  });

  it.each([18, 24])("uses the 12-month policy default when a removed %i-month term was configured", (defaultEvaluationTermMonths) => {
    const policy = resolveCreditPolicy({ defaultEvaluationTermMonths });
    expect(policy.defaultEvaluationTermMonths).toBe(12);
    expect(policy.allowedTerms).not.toContain(defaultEvaluationTermMonths);
  });

  it("compares requested device against customer capacity and alerts when exceeding limit", () => {
    const evaluation = evaluateCustomerCredit(BASE_VERIFIED_CUSTOMER, EMPTY_PAYMENT_HISTORY);

    const withinLimit = compareRequestedDeviceWithCapacity({
      evaluation,
      requestedSalePrice: "15000.00",
      fixedInstallment: "1335.00",
      frequency: "monthly",
    });
    expect(withinLimit.exceedsSalePriceLimit).toBe(false);
    expect(withinLimit.exceedsMonthlyCapacity).toBe(false);

    const overLimit = compareRequestedDeviceWithCapacity({
      evaluation,
      requestedSalePrice: "185000.00",
      fixedInstallment: "19200.00",
      frequency: "monthly",
    });
    expect(overLimit.exceedsSalePriceLimit).toBe(true);
    expect(overLimit.exceedsMonthlyCapacity).toBe(true);
    expect(overLimit.requiresManualReview).toBe(true);
    expect(overLimit.alerts.length).toBeGreaterThan(0);
  });

  it("supports custom administrator policy weights and thresholds", () => {
    const customPolicy = resolveCreditPolicy({
      ...DEFAULT_CREDIT_POLICY_SETTINGS,
      weights: {
        paymentCapacity: 35,
        paymentHistory: 25,
        incomeStability: 15,
        currentIndebtedness: 15,
        identityVerification: 10,
      },
      maxDebtToIncomePercent: "30.00",
    });

    const evaluation = evaluateCustomerCredit(BASE_VERIFIED_CUSTOMER, EMPTY_PAYMENT_HISTORY, customPolicy);
    expect(getFactor(evaluation.factors, "paymentCapacity").maxScore).toBe(35);
    expect(getFactor(evaluation.factors, "paymentHistory").maxScore).toBe(25);
    expect(evaluation.capacityBreakdown.maxAllowedDebtToIncomePercent).toBe("30.00");
  });
});
