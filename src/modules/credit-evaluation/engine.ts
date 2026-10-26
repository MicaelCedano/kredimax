import {
  calculateFinancingQuote,
  DEFAULT_FINANCING_SETTINGS,
  parseMoneyToCents,
  type FinancingSettings,
} from "@/modules/financing/calculator";

export const CREDIT_ALGORITHM_VERSION = "kredimax-internal-v3";

export type CreditScoreWeights = {
  paymentCapacity: number;
  paymentHistory: number;
  incomeStability: number;
  currentIndebtedness: number;
  identityVerification: number;
};

export type CreditRiskThresholds = {
  lowRiskMin: number;
  moderateLowRiskMin: number;
  reviewRequiredMin: number;
};

export type CreditPolicySettings = {
  weights: CreditScoreWeights;
  thresholds: CreditRiskThresholds;
  maxDebtToIncomePercent: string;
  defaultEvaluationTermMonths: number;
  evaluationValidityDays: number;
  requireManualReviewOverLimit: boolean;
  requireManualReviewForHighRisk: boolean;
  requireManualReviewForUnverifiedIncome: boolean;
  downPaymentPercent: string;
  annualRatePercent: string;
  legalExpenses: string;
  allowedTerms: number[];
  recoveryTargetPercent: string;
  recoveryEnabled: boolean;
};

export const DEFAULT_CREDIT_POLICY_SETTINGS: CreditPolicySettings = {
  weights: {
    paymentCapacity: 30,
    paymentHistory: 30,
    incomeStability: 15,
    currentIndebtedness: 15,
    identityVerification: 10,
  },
  thresholds: {
    lowRiskMin: 85,
    moderateLowRiskMin: 70,
    reviewRequiredMin: 50,
  },
  maxDebtToIncomePercent: "35.00",
  defaultEvaluationTermMonths: 12,
  evaluationValidityDays: 30,
  requireManualReviewOverLimit: true,
  requireManualReviewForHighRisk: true,
  requireManualReviewForUnverifiedIncome: true,
  downPaymentPercent: DEFAULT_FINANCING_SETTINGS.downPaymentPercent,
  annualRatePercent: DEFAULT_FINANCING_SETTINGS.annualRatePercent,
  legalExpenses: DEFAULT_FINANCING_SETTINGS.legalExpenses,
  allowedTerms: [...DEFAULT_FINANCING_SETTINGS.allowedTerms],
  recoveryTargetPercent: DEFAULT_FINANCING_SETTINGS.recoveryTargetPercent,
  recoveryEnabled: DEFAULT_FINANCING_SETTINGS.recoveryEnabled,
};

export type VerificationStatus = "declared" | "pending" | "verified";
export type CreditRiskLevel = "low" | "moderate_low" | "review_required" | "high" | "unrated";

export type CustomerFinancialInput = {
  identityNumber?: string | null;
  phone?: string | null;
  address?: string | null;
  occupation?: string | null;
  employmentType?: string | null;
  employer?: string | null;
  employmentTenureMonths?: number | null;
  declaredMonthlyIncome?: string | number | null;
  verifiedMonthlyIncome?: string | number | null;
  otherVerifiableIncome?: string | number | null;
  essentialMonthlyExpenses?: string | number | null;
  existingMonthlyDebts?: string | number | null;
  verifiedMonthlyDebts?: string | number | null;
  dependentsCount?: number | null;
  housingType?: string | null;
  monthlyRentExpense?: string | number | null;
  referenceName?: string | null;
  referencePhone?: string | null;
  workReferenceName?: string | null;
  workReferencePhone?: string | null;
  incomeVerificationStatus?: string | null;
  identityVerificationStatus?: string | null;
  employmentVerificationStatus?: string | null;
  financialDataConsent?: boolean | null;
};

export type InternalPaymentHistoryInput = {
  activeLoansCount: number;
  completedLoansCount: number;
  activePrincipalBalance: string;
  activeMonthlyObligation: string;
  paidInstallmentsCount: number;
  overdueInstallmentsCount: number;
  maxDaysPastDue: number;
  latePaidInstallmentsCount?: number;
  reversedPaymentsCount?: number;
};

export const EMPTY_PAYMENT_HISTORY: InternalPaymentHistoryInput = {
  activeLoansCount: 0,
  completedLoansCount: 0,
  activePrincipalBalance: "0.00",
  activeMonthlyObligation: "0.00",
  paidInstallmentsCount: 0,
  overdueInstallmentsCount: 0,
  maxDaysPastDue: 0,
  latePaidInstallmentsCount: 0,
  reversedPaymentsCount: 0,
};

export type CreditFactorBreakdown = {
  key: keyof CreditScoreWeights;
  label: string;
  score: number;
  maxScore: number;
  status: "positive" | "neutral" | "warning" | "critical";
  summary: string;
};

export type CapacityFormulaBreakdown = {
  declaredMonthlyIncome: string;
  verifiedMonthlyIncome: string;
  otherVerifiableIncome: string;
  effectiveMonthlyIncome: string;
  incomeBasisNote: string;
  essentialExpenses: string;
  monthlyRentExpense: string;
  totalEssentialOutflow: string;
  declaredMonthlyDebts: string;
  verifiedMonthlyDebts: string;
  activeKredimaxMonthlyDebt: string;
  totalMonthlyDebtObligations: string;
  currentDebtToIncomePercent: string;
  maxAllowedDebtToIncomePercent: string;
  dtiLimitedMonthlyCapacity: string;
  cashflowLimitedMonthlyCapacity: string;
  unadjustedMonthlyCapacity: string;
  riskAdjustmentMultiplierPercent: number;
  monthlyPaymentCapacity: string;
  recommendedTermMonths: number;
  annualRatePercent: string;
  downPaymentPercent: string;
  legalExpenses: string;
  recommendedMaxPrincipal: string;
  recommendedMaxSalePrice: string;
  recommendedDownPayment: string;
  recommendedInstallment: string;
  formulaSteps: string[];
};

export type CreditEvaluationResult = {
  algorithmVersion: string;
  status: "complete" | "incomplete";
  totalScore: number | null;
  riskLevel: CreditRiskLevel;
  riskLabel: string;
  verificationState: VerificationStatus;
  monthlyPaymentCapacity: string;
  recommendedMaxPrincipal: string;
  recommendedMaxSalePrice: string;
  recommendedDownPayment: string;
  recommendedTermMonths: number;
  recommendedInstallment: string;
  missingFields: string[];
  positiveDrivers: string[];
  negativeDrivers: string[];
  factors: CreditFactorBreakdown[];
  capacityBreakdown: CapacityFormulaBreakdown;
  historySummary: InternalPaymentHistoryInput;
  policySnapshot: CreditPolicySettings;
};

function safeMoneyToCents(value: string | number | null | undefined): bigint {
  if (value === null || value === undefined) return 0n;
  const cleaned = String(value).replace(/,/g, "").trim();
  if (!cleaned) return 0n;
  try {
    const cents = parseMoneyToCents(cleaned);
    return cents < 0n ? 0n : cents;
  } catch {
    const parsed = Number(cleaned);
    if (!Number.isFinite(parsed) || parsed <= 0) return 0n;
    return BigInt(Math.round(parsed * 100));
  }
}

function centsToDecimal(cents: bigint): string {
  const safe = cents < 0n ? 0n : cents;
  return `${safe / 100n}.${(safe % 100n).toString().padStart(2, "0")}`;
}

function parsePercentToBps(value: string, fallbackBps: bigint): bigint {
  const cleaned = String(value ?? "").trim();
  if (!/^(?:0|[1-9]\d{0,2})(?:\.\d{1,3})?$/.test(cleaned)) return fallbackBps;
  const [whole, fraction = ""] = cleaned.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.slice(0, 2).padEnd(2, "0"));
}

function roundRatioScore(pointsNumerator: number, maxScore: number): number {
  const clamped = Math.max(0, Math.min(1, pointsNumerator));
  return Math.round(clamped * maxScore);
}

export function riskLabelForLevel(level: CreditRiskLevel): string {
  switch (level) {
    case "low":
      return "Riesgo bajo";
    case "moderate_low":
      return "Riesgo moderado-bajo";
    case "review_required":
      return "Requiere revisión";
    case "high":
      return "Riesgo alto";
    default:
      return "Sin calificar";
  }
}

export function resolveCreditPolicy(
  rawPolicy?: Record<string, unknown> | null,
  financing?: Partial<FinancingSettings> | null,
): CreditPolicySettings {
  const rawWeights = (rawPolicy?.weights && typeof rawPolicy.weights === "object" ? rawPolicy.weights : {}) as Record<string, unknown>;
  const rawThresholds = (rawPolicy?.thresholds && typeof rawPolicy.thresholds === "object" ? rawPolicy.thresholds : {}) as Record<string, unknown>;

  const paymentCapacity = Number.isInteger(Number(rawWeights.paymentCapacity)) ? Number(rawWeights.paymentCapacity) : DEFAULT_CREDIT_POLICY_SETTINGS.weights.paymentCapacity;
  const paymentHistory = Number.isInteger(Number(rawWeights.paymentHistory)) ? Number(rawWeights.paymentHistory) : DEFAULT_CREDIT_POLICY_SETTINGS.weights.paymentHistory;
  const incomeStability = Number.isInteger(Number(rawWeights.incomeStability)) ? Number(rawWeights.incomeStability) : DEFAULT_CREDIT_POLICY_SETTINGS.weights.incomeStability;
  const currentIndebtedness = Number.isInteger(Number(rawWeights.currentIndebtedness)) ? Number(rawWeights.currentIndebtedness) : DEFAULT_CREDIT_POLICY_SETTINGS.weights.currentIndebtedness;
  const identityVerification = Number.isInteger(Number(rawWeights.identityVerification)) ? Number(rawWeights.identityVerification) : DEFAULT_CREDIT_POLICY_SETTINGS.weights.identityVerification;

  const weightSum = paymentCapacity + paymentHistory + incomeStability + currentIndebtedness + identityVerification;
  const validWeights = weightSum === 100 && [paymentCapacity, paymentHistory, incomeStability, currentIndebtedness, identityVerification].every((w) => w >= 0 && w <= 100)
    ? { paymentCapacity, paymentHistory, incomeStability, currentIndebtedness, identityVerification }
    : { ...DEFAULT_CREDIT_POLICY_SETTINGS.weights };

  const lowRiskMin = Number.isInteger(Number(rawThresholds.lowRiskMin)) ? Number(rawThresholds.lowRiskMin) : DEFAULT_CREDIT_POLICY_SETTINGS.thresholds.lowRiskMin;
  const moderateLowRiskMin = Number.isInteger(Number(rawThresholds.moderateLowRiskMin)) ? Number(rawThresholds.moderateLowRiskMin) : DEFAULT_CREDIT_POLICY_SETTINGS.thresholds.moderateLowRiskMin;
  const reviewRequiredMin = Number.isInteger(Number(rawThresholds.reviewRequiredMin)) ? Number(rawThresholds.reviewRequiredMin) : DEFAULT_CREDIT_POLICY_SETTINGS.thresholds.reviewRequiredMin;

  const validThresholds = lowRiskMin > moderateLowRiskMin && moderateLowRiskMin > reviewRequiredMin && reviewRequiredMin > 0 && lowRiskMin <= 100
    ? { lowRiskMin, moderateLowRiskMin, reviewRequiredMin }
    : { ...DEFAULT_CREDIT_POLICY_SETTINGS.thresholds };

  const allowedTerms = financing?.allowedTerms?.length
    ? [...financing.allowedTerms]
    : [...DEFAULT_CREDIT_POLICY_SETTINGS.allowedTerms];

  const rawDefaultTerm = Number(rawPolicy?.defaultEvaluationTermMonths ?? DEFAULT_CREDIT_POLICY_SETTINGS.defaultEvaluationTermMonths);
  const defaultEvaluationTermMonths = allowedTerms.includes(rawDefaultTerm)
    ? rawDefaultTerm
    : allowedTerms.includes(12)
      ? 12
      : allowedTerms[0] ?? 12;

  const rawDti = typeof rawPolicy?.maxDebtToIncomePercent === "string" && /^\d{1,2}(?:\.\d{1,2})?$/.test(rawPolicy.maxDebtToIncomePercent)
    ? rawPolicy.maxDebtToIncomePercent
    : DEFAULT_CREDIT_POLICY_SETTINGS.maxDebtToIncomePercent;

  const validityDays = Number(rawPolicy?.evaluationValidityDays);
  const evaluationValidityDays = Number.isInteger(validityDays) && validityDays >= 1 && validityDays <= 365
    ? validityDays
    : DEFAULT_CREDIT_POLICY_SETTINGS.evaluationValidityDays;

  return {
    weights: validWeights,
    thresholds: validThresholds,
    maxDebtToIncomePercent: rawDti,
    defaultEvaluationTermMonths,
    evaluationValidityDays,
    requireManualReviewOverLimit: typeof rawPolicy?.requireManualReviewOverLimit === "boolean"
      ? rawPolicy.requireManualReviewOverLimit
      : DEFAULT_CREDIT_POLICY_SETTINGS.requireManualReviewOverLimit,
    requireManualReviewForHighRisk: typeof rawPolicy?.requireManualReviewForHighRisk === "boolean"
      ? rawPolicy.requireManualReviewForHighRisk
      : DEFAULT_CREDIT_POLICY_SETTINGS.requireManualReviewForHighRisk,
    requireManualReviewForUnverifiedIncome: typeof rawPolicy?.requireManualReviewForUnverifiedIncome === "boolean"
      ? rawPolicy.requireManualReviewForUnverifiedIncome
      : DEFAULT_CREDIT_POLICY_SETTINGS.requireManualReviewForUnverifiedIncome,
    downPaymentPercent: String(financing?.downPaymentPercent ?? DEFAULT_CREDIT_POLICY_SETTINGS.downPaymentPercent),
    annualRatePercent: String(financing?.annualRatePercent ?? DEFAULT_CREDIT_POLICY_SETTINGS.annualRatePercent),
    legalExpenses: String(financing?.legalExpenses ?? DEFAULT_CREDIT_POLICY_SETTINGS.legalExpenses),
    allowedTerms,
    recoveryTargetPercent: String(financing?.recoveryTargetPercent ?? DEFAULT_CREDIT_POLICY_SETTINGS.recoveryTargetPercent),
    recoveryEnabled: Boolean(financing?.recoveryEnabled ?? DEFAULT_CREDIT_POLICY_SETTINGS.recoveryEnabled),
  };
}

function normalizeVerificationStatus(status: string | null | undefined): VerificationStatus {
  if (status === "verified" || status === "pending") return status;
  return "declared";
}

export function evaluateCustomerCredit(
  customer: CustomerFinancialInput,
  history: InternalPaymentHistoryInput = EMPTY_PAYMENT_HISTORY,
  policy: CreditPolicySettings = DEFAULT_CREDIT_POLICY_SETTINGS,
): CreditEvaluationResult {
  const declaredIncomeCents = safeMoneyToCents(customer.declaredMonthlyIncome);
  const verifiedIncomeCents = safeMoneyToCents(customer.verifiedMonthlyIncome);
  const otherVerifiableCents = safeMoneyToCents(customer.otherVerifiableIncome);
  const essentialExpensesCents = safeMoneyToCents(customer.essentialMonthlyExpenses);
  const rentExpenseCents = customer.housingType === "owned" || customer.housingType === "family"
    ? safeMoneyToCents(customer.monthlyRentExpense)
    : safeMoneyToCents(customer.monthlyRentExpense);
  const declaredDebtsCents = safeMoneyToCents(customer.existingMonthlyDebts);
  const verifiedDebtsCents = safeMoneyToCents(customer.verifiedMonthlyDebts);
  const activeKredimaxDebtCents = safeMoneyToCents(history.activeMonthlyObligation);

  const incomeStatus = normalizeVerificationStatus(customer.incomeVerificationStatus);
  const identityStatus = normalizeVerificationStatus(customer.identityVerificationStatus);
  const employmentStatus = normalizeVerificationStatus(customer.employmentVerificationStatus);

  const hasVerifiedIncome = verifiedIncomeCents > 0n && incomeStatus === "verified";
  const hasAnyVerifiedAmount = verifiedIncomeCents > 0n;
  const rawTotalVerifiedCents = verifiedIncomeCents + otherVerifiableCents;

  // Never invent income: if verified income exists, use it; otherwise if declared income exists, apply prudent 75% weighting until verified.
  let effectiveIncomeCents = 0n;
  let incomeBasisNote = "Sin ingresos registrados";
  if (hasVerifiedIncome) {
    effectiveIncomeCents = rawTotalVerifiedCents;
    incomeBasisNote = otherVerifiableCents > 0n
      ? "100% del ingreso mensual comprobado más otros ingresos verificables."
      : "100% del ingreso mensual comprobado.";
  } else if (hasAnyVerifiedAmount) {
    effectiveIncomeCents = (rawTotalVerifiedCents * 85n) / 100n;
    incomeBasisNote = "85% del ingreso registrado (pendiente de validación documental definitiva).";
  } else if (declaredIncomeCents > 0n) {
    effectiveIncomeCents = ((declaredIncomeCents + (otherVerifiableCents / 2n)) * 75n) / 100n;
    incomeBasisNote = "75% prudencial sobre ingreso declarado no comprobado documentalmente.";
  }

  const missingFields: string[] = [];
  if (declaredIncomeCents <= 0n && verifiedIncomeCents <= 0n) {
    missingFields.push("Ingreso mensual (declarado o comprobado)");
  }
  if (verifiedIncomeCents <= 0n || incomeStatus !== "verified") {
    missingFields.push("Comprobación de ingresos mensuales");
  }
  if (!customer.identityNumber?.trim()) {
    missingFields.push("Cédula o documento de identidad");
  }
  if (!customer.occupation?.trim() && !customer.employer?.trim() && !customer.employmentType?.trim()) {
    missingFields.push("Ocupación, tipo de empleo o empresa donde labora");
  }
  if (essentialExpensesCents <= 0n && rentExpenseCents <= 0n) {
    missingFields.push("Gastos mensuales esenciales / vivienda");
  }

  const totalEssentialOutflowCents = essentialExpensesCents + rentExpenseCents;
  const externalDebtsCents = verifiedDebtsCents > declaredDebtsCents ? verifiedDebtsCents : declaredDebtsCents;
  const totalDebtObligationsCents = externalDebtsCents + activeKredimaxDebtCents;

  const overallVerificationState: VerificationStatus =
    incomeStatus === "verified" && identityStatus === "verified"
      ? "verified"
      : incomeStatus === "pending" || identityStatus === "pending" || employmentStatus === "pending"
        ? "pending"
        : "declared";

  const positiveDrivers: string[] = [];
  const negativeDrivers: string[] = [];

  // If no income information exists at all, return "incomplete" / "unrated" without inventing a score.
  if (declaredIncomeCents <= 0n && verifiedIncomeCents <= 0n) {
    const emptyFactors: CreditFactorBreakdown[] = [
      {
        key: "paymentCapacity",
        label: "Capacidad de pago comprobada",
        score: 0,
        maxScore: policy.weights.paymentCapacity,
        status: "critical",
        summary: "Falta registrar el ingreso mensual del cliente para calcular su capacidad de pago.",
      },
      {
        key: "paymentHistory",
        label: "Historial de pagos en KrediMax",
        score: Math.round(policy.weights.paymentHistory * 0.5),
        maxScore: policy.weights.paymentHistory,
        status: "neutral",
        summary: "Pendiente de evaluación integral por falta de datos de ingresos.",
      },
      {
        key: "incomeStability",
        label: "Estabilidad de ingresos",
        score: 0,
        maxScore: policy.weights.incomeStability,
        status: "warning",
        summary: "Completa ocupación, empresa y antigüedad laboral.",
      },
      {
        key: "currentIndebtedness",
        label: "Endeudamiento actual",
        score: 0,
        maxScore: policy.weights.currentIndebtedness,
        status: "warning",
        summary: "No es posible medir la relación deuda/ingreso sin ingresos registrados.",
      },
      {
        key: "identityVerification",
        label: "Verificación de identidad y documentación",
        score: 0,
        maxScore: policy.weights.identityVerification,
        status: "warning",
        summary: "Completa documento de identidad y soporte documental.",
      },
    ];

    return {
      algorithmVersion: CREDIT_ALGORITHM_VERSION,
      status: "incomplete",
      totalScore: null,
      riskLevel: "unrated",
      riskLabel: "Sin calificar · Evaluación incompleta",
      verificationState: overallVerificationState,
      monthlyPaymentCapacity: "0.00",
      recommendedMaxPrincipal: "0.00",
      recommendedMaxSalePrice: "0.00",
      recommendedDownPayment: "0.00",
      recommendedTermMonths: policy.defaultEvaluationTermMonths,
      recommendedInstallment: "0.00",
      missingFields,
      positiveDrivers: [],
      negativeDrivers: ["Evaluación incompleta: registra el ingreso mensual del cliente para estimar su capacidad de financiamiento."],
      factors: emptyFactors,
      capacityBreakdown: {
        declaredMonthlyIncome: centsToDecimal(declaredIncomeCents),
        verifiedMonthlyIncome: centsToDecimal(verifiedIncomeCents),
        otherVerifiableIncome: centsToDecimal(otherVerifiableCents),
        effectiveMonthlyIncome: "0.00",
        incomeBasisNote,
        essentialExpenses: centsToDecimal(essentialExpensesCents),
        monthlyRentExpense: centsToDecimal(rentExpenseCents),
        totalEssentialOutflow: centsToDecimal(totalEssentialOutflowCents),
        declaredMonthlyDebts: centsToDecimal(declaredDebtsCents),
        verifiedMonthlyDebts: centsToDecimal(verifiedDebtsCents),
        activeKredimaxMonthlyDebt: centsToDecimal(activeKredimaxDebtCents),
        totalMonthlyDebtObligations: centsToDecimal(totalDebtObligationsCents),
        currentDebtToIncomePercent: "0.00",
        maxAllowedDebtToIncomePercent: policy.maxDebtToIncomePercent,
        dtiLimitedMonthlyCapacity: "0.00",
        cashflowLimitedMonthlyCapacity: "0.00",
        unadjustedMonthlyCapacity: "0.00",
        riskAdjustmentMultiplierPercent: 0,
        monthlyPaymentCapacity: "0.00",
        recommendedTermMonths: policy.defaultEvaluationTermMonths,
        annualRatePercent: policy.annualRatePercent,
        downPaymentPercent: policy.downPaymentPercent,
        legalExpenses: policy.legalExpenses,
        recommendedMaxPrincipal: "0.00",
        recommendedMaxSalePrice: "0.00",
        recommendedDownPayment: "0.00",
        recommendedInstallment: "0.00",
        formulaSteps: ["Evaluación incompleta: no se registraron ingresos mensuales."],
      },
      historySummary: history,
      policySnapshot: policy,
    };
  }

  // --- FACTOR 1: Capacidad de pago comprobada (default 30 pts) ---
  // If essential expenses were not entered yet, assume a prudent minimum reserve of 45% of effective income so capacity is never overstated.
  const prudentEssentialOutflowCents = totalEssentialOutflowCents > 0n
    ? totalEssentialOutflowCents
    : (effectiveIncomeCents * 45n) / 100n;
  const netDisposableAfterLivingAndDebtCents = effectiveIncomeCents - prudentEssentialOutflowCents - totalDebtObligationsCents;

  let capacityRatio = 0;
  if (netDisposableAfterLivingAndDebtCents > 0n && effectiveIncomeCents > 0n) {
    const disposableShare = Number(netDisposableAfterLivingAndDebtCents) / Number(effectiveIncomeCents);
    // A 30%+ free disposable margin after living expenses and debts achieves full ratio before verification cap
    capacityRatio = Math.min(1, disposableShare / 0.30);
    // Also require absolute disposable cushion (at least RD$8,000/month for full score)
    const absoluteCushionRatio = Math.min(1, Number(netDisposableAfterLivingAndDebtCents) / 800_000);
    capacityRatio = capacityRatio * 0.65 + absoluteCushionRatio * 0.35;
  }

  const verificationCap = hasVerifiedIncome ? 1.0 : hasAnyVerifiedAmount ? 0.8 : 0.65;
  const capacityScore = roundRatioScore(capacityRatio * verificationCap, policy.weights.paymentCapacity);
  let capacitySummary = "";
  if (netDisposableAfterLivingAndDebtCents <= 0n) {
    capacitySummary = "Los gastos esenciales y obligaciones actuales absorben la totalidad del ingreso computable.";
    negativeDrivers.push("Ingresos insuficientes frente al nivel actual de gastos y deudas.");
  } else if (hasVerifiedIncome) {
    capacitySummary = `Flujo neto disponible comprobado de RD$${centsToDecimal(netDisposableAfterLivingAndDebtCents)}/mes.`;
    if (capacityScore >= Math.round(policy.weights.paymentCapacity * 0.75)) {
      positiveDrivers.push("Capacidad mensual de pago respaldada por ingresos comprobados.");
    }
  } else {
    capacitySummary = `Flujo disponible estimado en RD$${centsToDecimal(netDisposableAfterLivingAndDebtCents)}/mes con ingresos aún pendientes de comprobación documental.`;
    negativeDrivers.push("Los ingresos declarados aún no cuentan con verificación documental completa.");
  }

  // --- FACTOR 2: Historial de pagos en KrediMax (default 30 pts) ---
  // Rule: Do not confuse lack of history with delinquency; new customers neither get unmerited max bonus nor get penalized.
  const hasAnyHistory =
    history.paidInstallmentsCount > 0 ||
    history.completedLoansCount > 0 ||
    history.overdueInstallmentsCount > 0 ||
    history.maxDaysPastDue > 0;

  let historyRatio = 0.5; // Neutral 50% baseline for new customers with no history
  let historySummaryText = "Cliente sin historial previo en KrediMax (base neutral sin penalización por ausencia de historial).";
  let historyStatus: CreditFactorBreakdown["status"] = "neutral";

  if (hasAnyHistory) {
    if (history.overdueInstallmentsCount > 0 || history.maxDaysPastDue > 0) {
      if (history.maxDaysPastDue >= 30 || history.overdueInstallmentsCount >= 2) {
        historyRatio = 0;
        historyStatus = "critical";
      } else if (history.maxDaysPastDue >= 8) {
        historyRatio = 0.15;
        historyStatus = "critical";
      } else {
        historyRatio = 0.30;
        historyStatus = "warning";
      }
      historySummaryText = `${history.overdueInstallmentsCount} cuota(s) vencida(s) · ${history.maxDaysPastDue} día(s) de atraso máximo.`;
      negativeDrivers.push(`Presenta ${history.overdueInstallmentsCount} cuota(s) atrasada(s) en KrediMax (${history.maxDaysPastDue} días de mora).`);
    } else {
      // Positive payment evidence scales with depth of track record
      const paidBonus = Math.min(0.35, history.paidInstallmentsCount * 0.04);
      const completedLoanBonus = Math.min(0.20, history.completedLoansCount * 0.12);
      const latePenalty = Math.min(0.25, (history.latePaidInstallmentsCount ?? 0) * 0.06);
      historyRatio = Math.max(0.5, Math.min(1, 0.5 + paidBonus + completedLoanBonus - latePenalty));
      historyStatus = historyRatio >= 0.75 ? "positive" : "neutral";
      historySummaryText = `${history.paidInstallmentsCount} cuota(s) pagada(s) al día y ${history.completedLoansCount} financiamiento(s) completado(s) sin mora activa.`;
      if (history.paidInstallmentsCount >= 3 || history.completedLoansCount >= 1) {
        positiveDrivers.push(`Buen comportamiento de pago en KrediMax (${history.paidInstallmentsCount} cuotas cumplidas).`);
      }
    }
  }
  const historyScore = roundRatioScore(historyRatio, policy.weights.paymentHistory);

  // --- FACTOR 3: Estabilidad de ingresos (default 15 pts) ---
  let stabilityRatio = 0;
  const empType = customer.employmentType ?? "";
  if (empType === "formal_employee" || empType === "retired") {
    stabilityRatio += 0.45;
  } else if (empType === "business_owner") {
    stabilityRatio += 0.40;
  } else if (empType === "independent") {
    stabilityRatio += 0.30;
  } else if (empType === "informal_employee") {
    stabilityRatio += 0.22;
  } else if (customer.employer?.trim() || customer.occupation?.trim()) {
    stabilityRatio += 0.25;
  }

  const tenure = customer.employmentTenureMonths ?? 0;
  if (tenure >= 24) {
    stabilityRatio += 0.40;
    positiveDrivers.push(`Antigüedad laboral sólida (${tenure} meses).`);
  } else if (tenure >= 12) {
    stabilityRatio += 0.30;
    positiveDrivers.push(`Antigüedad laboral de ${tenure} meses.`);
  } else if (tenure >= 6) {
    stabilityRatio += 0.18;
  } else if (tenure > 0) {
    stabilityRatio += 0.08;
    negativeDrivers.push(`Antigüedad laboral reciente (${tenure} meses).`);
  }

  if (employmentStatus === "verified") {
    stabilityRatio += 0.15;
  } else if (customer.workReferenceName?.trim() && customer.workReferencePhone?.trim()) {
    stabilityRatio += 0.08;
  }
  const stabilityScore = roundRatioScore(stabilityRatio, policy.weights.incomeStability);
  const stabilitySummary = customer.employer?.trim() || customer.occupation?.trim()
    ? `${customer.occupation || "Actividad registrada"}${customer.employer ? ` en ${customer.employer}` : ""}${tenure > 0 ? ` · ${tenure} meses de antigüedad` : ""}.`
    : "Sin datos completos de actividad laboral o antigüedad.";

  // --- FACTOR 4: Endeudamiento actual (default 15 pts) ---
  const dtiBps = effectiveIncomeCents > 0n
    ? (totalDebtObligationsCents * 10000n) / effectiveIncomeCents
    : 10000n;
  const dtiPercentNumber = Number(dtiBps) / 100;
  const maxDtiBps = parsePercentToBps(policy.maxDebtToIncomePercent, 3500n);
  const maxDtiPercentNumber = Number(maxDtiBps) / 100;

  let indebtednessRatio = 0;
  if (dtiPercentNumber <= 15) {
    indebtednessRatio = 1.0;
    positiveDrivers.push(`Bajo nivel de endeudamiento actual (${dtiPercentNumber.toFixed(1)}% del ingreso).`);
  } else if (dtiPercentNumber <= 25) {
    indebtednessRatio = 0.80;
  } else if (dtiPercentNumber <= maxDtiPercentNumber) {
    indebtednessRatio = 0.60;
  } else if (dtiPercentNumber <= 50) {
    indebtednessRatio = 0.25;
    negativeDrivers.push(`Endeudamiento mensual (${dtiPercentNumber.toFixed(1)}%) supera el límite orientativo de ${maxDtiPercentNumber.toFixed(0)}%.`);
  } else {
    indebtednessRatio = 0;
    negativeDrivers.push(`Sobreendeudamiento actual (${dtiPercentNumber.toFixed(1)}% de sus ingresos comprometidos en deudas).`);
  }
  if (history.activeLoansCount >= 2) {
    indebtednessRatio = Math.max(0, indebtednessRatio - 0.20);
    negativeDrivers.push(`Mantiene ${history.activeLoansCount} financiamientos simultáneos activos en KrediMax.`);
  }
  const indebtednessScore = roundRatioScore(indebtednessRatio, policy.weights.currentIndebtedness);
  const indebtednessSummary = `Obligaciones mensuales totales de RD$${centsToDecimal(totalDebtObligationsCents)} (${dtiPercentNumber.toFixed(1)}% del ingreso computable).`;

  // --- FACTOR 5: Verificación de identidad y documentación (default 10 pts) ---
  let verificationRatio = 0;
  if (customer.identityNumber?.trim()) verificationRatio += 0.25;
  if (identityStatus === "verified") verificationRatio += 0.30;
  if (incomeStatus === "verified") verificationRatio += 0.25;
  if (employmentStatus === "verified") verificationRatio += 0.10;
  if (customer.financialDataConsent) verificationRatio += 0.10;

  const verificationScore = roundRatioScore(verificationRatio, policy.weights.identityVerification);
  if (identityStatus === "verified" && incomeStatus === "verified") {
    positiveDrivers.push("Identidad e ingresos verificados documentalmente.");
  } else if (identityStatus !== "verified") {
    negativeDrivers.push("Identidad o soporte documental pendiente de verificación.");
  }
  const verificationSummary = `Identidad: ${identityStatus === "verified" ? "verificada" : identityStatus === "pending" ? "en revisión" : "declarada"} · Ingresos: ${incomeStatus === "verified" ? "verificados" : incomeStatus === "pending" ? "en revisión" : "declarados"}.`;

  const totalScore = Math.max(
    0,
    Math.min(
      100,
      capacityScore + historyScore + stabilityScore + indebtednessScore + verificationScore,
    ),
  );

  let riskLevel: CreditRiskLevel = "high";
  if (totalScore >= policy.thresholds.lowRiskMin) {
    riskLevel = "low";
  } else if (totalScore >= policy.thresholds.moderateLowRiskMin) {
    riskLevel = "moderate_low";
  } else if (totalScore >= policy.thresholds.reviewRequiredMin) {
    riskLevel = "review_required";
  } else {
    riskLevel = "high";
  }

  // If the customer currently has overdue installments in KrediMax, force at least "review_required" or "high"
  if (history.overdueInstallmentsCount > 0 && (riskLevel === "low" || riskLevel === "moderate_low")) {
    riskLevel = history.maxDaysPastDue >= 15 ? "high" : "review_required";
  }

  // --- FINANCING CAPACITY CALCULATION (Exact KrediMax Simple-Interest Methodology) ---
  // 1. Maximum total debt service allowed by DTI policy: Y * (maxDtiPercent / 100) - totalDebtObligations
  const maxTotalDebtServiceCents = (effectiveIncomeCents * maxDtiBps) / 10000n;
  const dtiLimitedCapacityCents = maxTotalDebtServiceCents > totalDebtObligationsCents
    ? maxTotalDebtServiceCents - totalDebtObligationsCents
    : 0n;

  // 2. Maximum monthly payment from net free cashflow (85% of net cashflow after essential living expenses & existing debts)
  const cashflowLimitedCapacityCents = netDisposableAfterLivingAndDebtCents > 0n
    ? (netDisposableAfterLivingAndDebtCents * 85n) / 100n
    : 0n;

  const unadjustedMonthlyCapacityCents = dtiLimitedCapacityCents < cashflowLimitedCapacityCents
    ? dtiLimitedCapacityCents
    : cashflowLimitedCapacityCents;

  // 3. Risk multiplier according to internal risk classification and arrears
  let riskMultiplierPercent = 100;
  if (history.overdueInstallmentsCount > 0) {
    riskMultiplierPercent = 0;
  } else if (riskLevel === "low") {
    riskMultiplierPercent = 100;
  } else if (riskLevel === "moderate_low") {
    riskMultiplierPercent = 90;
  } else if (riskLevel === "review_required") {
    riskMultiplierPercent = 75;
  } else {
    riskMultiplierPercent = 0;
  }

  const prudentMonthlyCapacityCents = (unadjustedMonthlyCapacityCents * BigInt(riskMultiplierPercent)) / 100n;

  // 4. Invert KrediMax's exact simple-interest installment formula:
  //    In calculateFinancingQuote (monthly frequency, N = T months):
  //    baseInstallment = ceil((P + P * (r / 100) * (T / 12) + L) / T)
  //    Therefore: P_base = ((C_max * T - L) * 120000) / (120000 + r_bps * T)
  //    Start from the level-plan budget, then verify the highest payment with balanced recovery.
  const termMonths = policy.defaultEvaluationTermMonths;
  const termBig = BigInt(termMonths);
  const annualRateBps = parsePercentToBps(policy.annualRatePercent, 4800n);
  const downPaymentBps = parsePercentToBps(policy.downPaymentPercent, 3000n);
  const legalExpensesCents = safeMoneyToCents(policy.legalExpenses);

  const roundedCapacityCents = (prudentMonthlyCapacityCents / 5000n) * 5000n;
  const totalTermBudgetCents = roundedCapacityCents * termBig;
  let recommendedMaxPrincipalCents = 0n;
  let recommendedMaxSalePriceCents = 0n;
  let recommendedDownPaymentCents = 0n;
  let recommendedInstallmentCents = 0n;

  if (totalTermBudgetCents > legalExpensesCents && downPaymentBps < 10000n) {
    const netForPrincipalAndInterest = totalTermBudgetCents - legalExpensesCents;
    const denominator = 120000n + annualRateBps * termBig;
    const basePrincipalCents = (netForPrincipalAndInterest * 120000n) / denominator;
    const rawPrincipalCents = basePrincipalCents;

    if (rawPrincipalCents > 0n) {
      // SalePrice S such that S - round(S * downPaymentBps / 10000) <= rawPrincipalCents
      const financedShareBps = 10000n - downPaymentBps;
      const candidateSalePriceCents = (rawPrincipalCents * 10000n) / financedShareBps;
      if (candidateSalePriceCents >= 100n) {
        try {
          const todayIso = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santo_Domingo" }).format(new Date());
          const quoteAtPrice = (price: bigint) => calculateFinancingQuote({
            salePrice: centsToDecimal(price),
            deviceCost: centsToDecimal(price),
            downPaymentPercent: policy.downPaymentPercent,
            annualRatePercent: policy.annualRatePercent,
            legalExpenses: policy.legalExpenses,
            termMonths,
            frequency: "monthly",
            firstInstallmentDate: todayIso,
            today: todayIso,
            recoveryTargetPercent: policy.recoveryTargetPercent,
            recoveryEnabled: policy.recoveryEnabled,
          });
          let verifiedQuote = quoteAtPrice(candidateSalePriceCents);
          // A cent of interest rounding must not push the next RD$50 step over capacity.
          if (safeMoneyToCents(verifiedQuote.fixedInstallment) > prudentMonthlyCapacityCents) {
            let low = 100n, high = candidateSalePriceCents - 1n;
            let affordableQuote: typeof verifiedQuote | null = null;
            while (low <= high) {
              const middle = (low + high) / 2n;
              const candidate = quoteAtPrice(middle);
              if (safeMoneyToCents(candidate.fixedInstallment) <= prudentMonthlyCapacityCents) {
                affordableQuote = candidate;
                low = middle + 1n;
              } else high = middle - 1n;
            }
            if (!affordableQuote) throw new Error("No existe una cuota redondeada dentro de la capacidad.");
            verifiedQuote = affordableQuote;
          }
          recommendedMaxSalePriceCents = safeMoneyToCents(verifiedQuote.salePrice);
          recommendedDownPaymentCents = safeMoneyToCents(verifiedQuote.downPayment);
          recommendedMaxPrincipalCents = safeMoneyToCents(verifiedQuote.principal);
          recommendedInstallmentCents = safeMoneyToCents(verifiedQuote.fixedInstallment);
        } catch {
          // Keep the recommendation at zero when no exact affordable quote can be verified.
        }
      }
    }
  }

  const formulaSteps = [
    `1. Ingreso mensual computable (Y): RD$${centsToDecimal(effectiveIncomeCents)} (${incomeBasisNote})`,
    `2. Gastos esenciales + vivienda (G): RD$${centsToDecimal(prudentEssentialOutflowCents)} · Obligaciones mensuales vigentes (D): RD$${centsToDecimal(totalDebtObligationsCents)}`,
    `3. Tope por endeudamiento (${policy.maxDebtToIncomePercent}% de Y − D): RD$${centsToDecimal(dtiLimitedCapacityCents)} · Tope por flujo neto (85% de [Y − G − D]): RD$${centsToDecimal(cashflowLimitedCapacityCents)}`,
    `4. Cuota máxima orientativa (C_máx = mín(tope DTI, tope flujo) × ${riskMultiplierPercent}% ajuste de riesgo): RD$${centsToDecimal(prudentMonthlyCapacityCents)}/mes`,
    `5. Capital máximo financiable en interés simple (P_máx = [C_máx × ${termMonths} − RD$${centsToDecimal(legalExpensesCents)}] ÷ [1 + ${Number(policy.annualRatePercent).toFixed(2)}% × ${termMonths}/12]): RD$${centsToDecimal(recommendedMaxPrincipalCents)}`,
    `6. Precio máximo sugerido del equipo (S_máx = P_máx ÷ [1 − ${policy.downPaymentPercent}% inicial]): RD$${centsToDecimal(recommendedMaxSalePriceCents)} (Inicial requerida: RD$${centsToDecimal(recommendedDownPaymentCents)})`,
  ];

  const factors: CreditFactorBreakdown[] = [
    {
      key: "paymentCapacity",
      label: "Capacidad de pago comprobada",
      score: capacityScore,
      maxScore: policy.weights.paymentCapacity,
      status: capacityScore >= policy.weights.paymentCapacity * 0.7 ? "positive" : capacityScore >= policy.weights.paymentCapacity * 0.4 ? "neutral" : "critical",
      summary: capacitySummary,
    },
    {
      key: "paymentHistory",
      label: "Historial de pagos en KrediMax",
      score: historyScore,
      maxScore: policy.weights.paymentHistory,
      status: historyStatus,
      summary: historySummaryText,
    },
    {
      key: "incomeStability",
      label: "Estabilidad de ingresos",
      score: stabilityScore,
      maxScore: policy.weights.incomeStability,
      status: stabilityScore >= policy.weights.incomeStability * 0.7 ? "positive" : stabilityScore >= policy.weights.incomeStability * 0.4 ? "neutral" : "warning",
      summary: stabilitySummary,
    },
    {
      key: "currentIndebtedness",
      label: "Endeudamiento actual",
      score: indebtednessScore,
      maxScore: policy.weights.currentIndebtedness,
      status: indebtednessScore >= policy.weights.currentIndebtedness * 0.7 ? "positive" : indebtednessScore >= policy.weights.currentIndebtedness * 0.4 ? "neutral" : "critical",
      summary: indebtednessSummary,
    },
    {
      key: "identityVerification",
      label: "Verificación de identidad y documentación",
      score: verificationScore,
      maxScore: policy.weights.identityVerification,
      status: verificationScore >= policy.weights.identityVerification * 0.7 ? "positive" : verificationScore >= policy.weights.identityVerification * 0.4 ? "neutral" : "warning",
      summary: verificationSummary,
    },
  ];

  return {
    algorithmVersion: CREDIT_ALGORITHM_VERSION,
    status: "complete",
    totalScore,
    riskLevel,
    riskLabel: riskLabelForLevel(riskLevel),
    verificationState: overallVerificationState,
    monthlyPaymentCapacity: centsToDecimal(prudentMonthlyCapacityCents),
    recommendedMaxPrincipal: centsToDecimal(recommendedMaxPrincipalCents),
    recommendedMaxSalePrice: centsToDecimal(recommendedMaxSalePriceCents),
    recommendedDownPayment: centsToDecimal(recommendedDownPaymentCents),
    recommendedTermMonths: termMonths,
    recommendedInstallment: centsToDecimal(recommendedInstallmentCents),
    missingFields,
    positiveDrivers,
    negativeDrivers,
    factors,
    capacityBreakdown: {
      declaredMonthlyIncome: centsToDecimal(declaredIncomeCents),
      verifiedMonthlyIncome: centsToDecimal(verifiedIncomeCents),
      otherVerifiableIncome: centsToDecimal(otherVerifiableCents),
      effectiveMonthlyIncome: centsToDecimal(effectiveIncomeCents),
      incomeBasisNote,
      essentialExpenses: centsToDecimal(essentialExpensesCents),
      monthlyRentExpense: centsToDecimal(rentExpenseCents),
      totalEssentialOutflow: centsToDecimal(prudentEssentialOutflowCents),
      declaredMonthlyDebts: centsToDecimal(declaredDebtsCents),
      verifiedMonthlyDebts: centsToDecimal(verifiedDebtsCents),
      activeKredimaxMonthlyDebt: centsToDecimal(activeKredimaxDebtCents),
      totalMonthlyDebtObligations: centsToDecimal(totalDebtObligationsCents),
      currentDebtToIncomePercent: dtiPercentNumber.toFixed(2),
      maxAllowedDebtToIncomePercent: policy.maxDebtToIncomePercent,
      dtiLimitedMonthlyCapacity: centsToDecimal(dtiLimitedCapacityCents),
      cashflowLimitedMonthlyCapacity: centsToDecimal(cashflowLimitedCapacityCents),
      unadjustedMonthlyCapacity: centsToDecimal(unadjustedMonthlyCapacityCents),
      riskAdjustmentMultiplierPercent: riskMultiplierPercent,
      monthlyPaymentCapacity: centsToDecimal(prudentMonthlyCapacityCents),
      recommendedTermMonths: termMonths,
      annualRatePercent: policy.annualRatePercent,
      downPaymentPercent: policy.downPaymentPercent,
      legalExpenses: policy.legalExpenses,
      recommendedMaxPrincipal: centsToDecimal(recommendedMaxPrincipalCents),
      recommendedMaxSalePrice: centsToDecimal(recommendedMaxSalePriceCents),
      recommendedDownPayment: centsToDecimal(recommendedDownPaymentCents),
      recommendedInstallment: centsToDecimal(recommendedInstallmentCents),
      formulaSteps,
    },
    historySummary: history,
    policySnapshot: policy,
  };
}

export type ApplicationCapacityComparison = {
  requestedSalePrice: string;
  recommendedMaxSalePrice: string;
  salePriceDifference: string;
  exceedsSalePriceLimit: boolean;
  monthlyEquivalentInstallment: string;
  monthlyPaymentCapacity: string;
  exceedsMonthlyCapacity: boolean;
  capacityUtilizationPercent: number;
  requiresManualReview: boolean;
  alerts: string[];
  recommendationText: string;
};

export function compareRequestedDeviceWithCapacity(input: {
  evaluation: Pick<
    CreditEvaluationResult,
    | "status"
    | "totalScore"
    | "riskLevel"
    | "verificationState"
    | "monthlyPaymentCapacity"
    | "recommendedMaxSalePrice"
  >;
  requestedSalePrice: string;
  fixedInstallment: string;
  frequency: "monthly" | "fortnightly";
  policy?: Partial<CreditPolicySettings>;
}): ApplicationCapacityComparison {
  const requestedSaleCents = safeMoneyToCents(input.requestedSalePrice);
  const recommendedSaleCents = safeMoneyToCents(input.evaluation.recommendedMaxSalePrice);
  const rawInstallmentCents = safeMoneyToCents(input.fixedInstallment);
  const monthlyEquivalentCents = input.frequency === "fortnightly" ? rawInstallmentCents * 2n : rawInstallmentCents;
  const capacityCents = safeMoneyToCents(input.evaluation.monthlyPaymentCapacity);

  const exceedsSalePriceLimit = requestedSaleCents > recommendedSaleCents;
  const exceedsMonthlyCapacity = monthlyEquivalentCents > capacityCents;
  const diffCents = requestedSaleCents > recommendedSaleCents ? requestedSaleCents - recommendedSaleCents : 0n;

  const capacityUtilizationPercent = capacityCents > 0n
    ? Math.round((Number(monthlyEquivalentCents) / Number(capacityCents)) * 100)
    : monthlyEquivalentCents > 0n
      ? 999
      : 0;

  const alerts: string[] = [];
  if (input.evaluation.status === "incomplete" || input.evaluation.riskLevel === "unrated") {
    alerts.push("El cliente tiene una evaluación crediticia incompleta; completa y verifica sus ingresos para conocer su límite recomendado.");
  }
  if (exceedsSalePriceLimit) {
    alerts.push(`El precio del equipo solicitado (RD$${centsToDecimal(requestedSaleCents)}) supera el precio máximo sugerido (RD$${centsToDecimal(recommendedSaleCents)}) por RD$${centsToDecimal(diffCents)}.`);
  }
  if (exceedsMonthlyCapacity) {
    alerts.push(`La carga mensual de la nueva cuota (RD$${centsToDecimal(monthlyEquivalentCents)}/mes) supera la capacidad mensual orientativa del cliente (RD$${centsToDecimal(capacityCents)}/mes).`);
  }
  if (input.evaluation.riskLevel === "high" && (input.policy?.requireManualReviewForHighRisk ?? true)) {
    alerts.push("El cliente presenta nivel de riesgo alto; cualquier aprobación requiere excepción justificada por un evaluador autorizado.");
  }
  if (input.evaluation.verificationState !== "verified" && (input.policy?.requireManualReviewForUnverifiedIncome ?? true)) {
    alerts.push("Los ingresos o documentos del cliente figuran como declarados/pendientes de verificación.");
  }

  const requiresManualReview =
    input.evaluation.status === "incomplete" ||
    ((exceedsSalePriceLimit || exceedsMonthlyCapacity) && (input.policy?.requireManualReviewOverLimit ?? true)) ||
    (input.evaluation.riskLevel === "high" && (input.policy?.requireManualReviewForHighRisk ?? true)) ||
    input.evaluation.riskLevel === "review_required";

  const recommendationText = !exceedsSalePriceLimit && !exceedsMonthlyCapacity && input.evaluation.status === "complete"
    ? "El monto solicitado se encuentra dentro de la capacidad de financiamiento estimada para el cliente."
    : "La solicitud excede los parámetros orientativos o requiere validación manual; puedes enviarla a evaluación para decisión del personal autorizado.";

  return {
    requestedSalePrice: centsToDecimal(requestedSaleCents),
    recommendedMaxSalePrice: centsToDecimal(recommendedSaleCents),
    salePriceDifference: centsToDecimal(diffCents),
    exceedsSalePriceLimit,
    monthlyEquivalentInstallment: centsToDecimal(monthlyEquivalentCents),
    monthlyPaymentCapacity: centsToDecimal(capacityCents),
    exceedsMonthlyCapacity,
    capacityUtilizationPercent,
    requiresManualReview,
    alerts,
    recommendationText,
  };
}
