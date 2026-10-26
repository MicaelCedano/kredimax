import type { SupabaseClient } from "@supabase/supabase-js";
import { newFinancingTerms } from "@/modules/financing/term-policy";
import {
  CREDIT_ALGORITHM_VERSION,
  EMPTY_PAYMENT_HISTORY,
  evaluateCustomerCredit,
  resolveCreditPolicy,
  type CreditEvaluationResult,
  type CreditPolicySettings,
  type CustomerFinancialInput,
  type InternalPaymentHistoryInput,
} from "@/modules/credit-evaluation/engine";

export type StoredCreditEvaluationRow = {
  id: string;
  algorithm_version: string;
  status: "complete" | "incomplete";
  total_score: number | null;
  risk_level: string;
  verification_state: string;
  monthly_payment_capacity: string | number;
  recommended_max_principal: string | number;
  recommended_max_sale_price: string | number;
  recommended_down_payment: string | number;
  recommended_term_months: number;
  trigger_event: string;
  factors: Record<string, unknown>;
  valid_until: string | null;
  created_at: string;
};

export async function loadTenantCreditPolicy(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<CreditPolicySettings> {
  try {
    const { data } = await supabase
      .from("financing_settings")
      .select("down_payment_percent,annual_rate_percent,legal_expenses,allowed_terms,recovery_target_percent,recovery_enabled,credit_policy")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (!data) return resolveCreditPolicy(null, null);
    return resolveCreditPolicy(
      (data.credit_policy as Record<string, unknown> | null) ?? null,
      {
        downPaymentPercent: String(data.down_payment_percent ?? "30.00"),
        annualRatePercent: String(data.annual_rate_percent ?? "48.000"),
        legalExpenses: String(data.legal_expenses ?? "1000.00"),
        allowedTerms: newFinancingTerms(data.allowed_terms),
        recoveryTargetPercent: String(data.recovery_target_percent ?? "100.00"),
        recoveryEnabled: Boolean(data.recovery_enabled),
      },
    );
  } catch {
    return resolveCreditPolicy(null, null);
  }
}

export async function loadCustomerInternalHistory(
  supabase: SupabaseClient,
  tenantId: string,
  customerId: string,
): Promise<InternalPaymentHistoryInput> {
  try {
    const { data: loans } = await supabase
      .from("loans")
      .select("id,status,principal,installment_count")
      .eq("tenant_id", tenantId)
      .eq("customer_id", customerId);

    if (!loans?.length) return { ...EMPTY_PAYMENT_HISTORY };

    const activeLoans = loans.filter((loan) => loan.status === "active" || loan.status === "approved");
    const completedLoans = loans.filter((loan) => loan.status === "paid_off");
    const loanIds = loans.map((loan) => loan.id);

    const { data: installments } = await supabase
      .from("installments")
      .select("id,loan_id,sequence,due_date,amount_due,amount_paid,status")
      .eq("tenant_id", tenantId)
      .in("loan_id", loanIds);

    const todayIso = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santo_Domingo" }).format(new Date());
    const todayMs = new Date(`${todayIso}T00:00:00.000Z`).getTime();

    let paidInstallmentsCount = 0;
    let overdueInstallmentsCount = 0;
    let maxDaysPastDue = 0;
    let activeBalanceCents = 0n;
    const nextUnpaidByLoan = new Map<string, bigint>();

    const activeLoanIdSet = new Set(activeLoans.map((l) => l.id));

    for (const inst of installments ?? []) {
      const dueCents = BigInt(Math.round(Number(inst.amount_due ?? 0) * 100));
      const paidCents = BigInt(Math.round(Number(inst.amount_paid ?? 0) * 100));
      const remainingCents = dueCents > paidCents ? dueCents - paidCents : 0n;

      if (inst.status === "paid" || remainingCents === 0n) {
        paidInstallmentsCount += 1;
        continue;
      }
      if (inst.status === "waived") continue;

      if (activeLoanIdSet.has(inst.loan_id)) {
        activeBalanceCents += remainingCents;
        const currentLoanInst = nextUnpaidByLoan.get(inst.loan_id);
        if (currentLoanInst === undefined || dueCents > currentLoanInst) {
          nextUnpaidByLoan.set(inst.loan_id, dueCents);
        }
      }

      if (typeof inst.due_date === "string" && inst.due_date < todayIso) {
        overdueInstallmentsCount += 1;
        const dueMs = new Date(`${inst.due_date}T00:00:00.000Z`).getTime();
        const diffDays = Math.max(1, Math.floor((todayMs - dueMs) / 86_400_000));
        if (diffDays > maxDaysPastDue) maxDaysPastDue = diffDays;
      }
    }

    let activeMonthlyObligationCents = 0n;
    for (const val of nextUnpaidByLoan.values()) {
      activeMonthlyObligationCents += val;
    }

    const toMoney = (cents: bigint) => `${cents / 100n}.${(cents % 100n).toString().padStart(2, "0")}`;

    return {
      activeLoansCount: activeLoans.length,
      completedLoansCount: completedLoans.length,
      activePrincipalBalance: toMoney(activeBalanceCents),
      activeMonthlyObligation: toMoney(activeMonthlyObligationCents),
      paidInstallmentsCount,
      overdueInstallmentsCount,
      maxDaysPastDue,
    };
  } catch {
    return { ...EMPTY_PAYMENT_HISTORY };
  }
}

export async function computeAndPersistCustomerEvaluation(params: {
  supabase: SupabaseClient;
  tenantId: string;
  customerId: string;
  userId?: string | null;
  triggerEvent: string;
}): Promise<CreditEvaluationResult | null> {
  try {
    const [{ data: customer }, { data: latestApps }, policy, history] = await Promise.all([
      params.supabase
        .from("customers")
        .select(
          "id,branch_id,full_name,identity_number,phone,address,employer,monthly_income,reference_name,reference_phone,occupation,employment_type,employment_tenure_months,verified_monthly_income,other_verifiable_income,essential_monthly_expenses,existing_monthly_debts,verified_monthly_debts,dependents_count,housing_type,monthly_rent_expense,work_reference_name,work_reference_phone,income_verification_status,identity_verification_status,employment_verification_status,financial_data_consent",
        )
        .eq("tenant_id", params.tenantId)
        .eq("id", params.customerId)
        .maybeSingle(),
      params.supabase
        .from("credit_applications")
        .select("quote_snapshot")
        .eq("tenant_id", params.tenantId)
        .eq("customer_id", params.customerId)
        .order("created_at", { ascending: false })
        .limit(1),
      loadTenantCreditPolicy(params.supabase, params.tenantId),
      loadCustomerInternalHistory(params.supabase, params.tenantId, params.customerId),
    ]);

    if (!customer) return null;

    const appApplicant = (latestApps?.[0]?.quote_snapshot as {
      applicant?: { employer?: string | null; monthlyIncome?: string | null; reference?: { name?: string | null; phone?: string | null } | null };
    } | null)?.applicant;

    const input: CustomerFinancialInput = {
      identityNumber: customer.identity_number,
      phone: customer.phone,
      address: customer.address,
      occupation: customer.occupation,
      employmentType: customer.employment_type,
      employer: customer.employer || appApplicant?.employer || null,
      employmentTenureMonths: customer.employment_tenure_months,
      declaredMonthlyIncome: customer.monthly_income ?? appApplicant?.monthlyIncome ?? null,
      verifiedMonthlyIncome: customer.verified_monthly_income,
      otherVerifiableIncome: customer.other_verifiable_income,
      essentialMonthlyExpenses: customer.essential_monthly_expenses,
      existingMonthlyDebts: customer.existing_monthly_debts,
      verifiedMonthlyDebts: customer.verified_monthly_debts,
      dependentsCount: customer.dependents_count,
      housingType: customer.housing_type,
      monthlyRentExpense: customer.monthly_rent_expense,
      referenceName: customer.reference_name || appApplicant?.reference?.name || null,
      referencePhone: customer.reference_phone || appApplicant?.reference?.phone || null,
      workReferenceName: customer.work_reference_name,
      workReferencePhone: customer.work_reference_phone,
      incomeVerificationStatus: customer.income_verification_status,
      identityVerificationStatus: customer.identity_verification_status,
      employmentVerificationStatus: customer.employment_verification_status,
      financialDataConsent: customer.financial_data_consent,
    };

    const evaluation = evaluateCustomerCredit(input, history, policy);
    const validUntil = new Date(Date.now() + policy.evaluationValidityDays * 86_400_000).toISOString();

    await params.supabase.from("customer_credit_evaluations").insert({
      tenant_id: params.tenantId,
      branch_id: customer.branch_id,
      customer_id: customer.id,
      algorithm_version: CREDIT_ALGORITHM_VERSION,
      status: evaluation.status,
      total_score: evaluation.totalScore,
      risk_level: evaluation.riskLevel,
      verification_state: evaluation.verificationState,
      monthly_payment_capacity: evaluation.monthlyPaymentCapacity,
      recommended_max_principal: evaluation.recommendedMaxPrincipal,
      recommended_max_sale_price: evaluation.recommendedMaxSalePrice,
      recommended_down_payment: evaluation.recommendedDownPayment,
      recommended_term_months: evaluation.recommendedTermMonths,
      trigger_event: params.triggerEvent,
      factors: {
        factors: evaluation.factors,
        missingFields: evaluation.missingFields,
        positiveDrivers: evaluation.positiveDrivers,
        negativeDrivers: evaluation.negativeDrivers,
        capacityBreakdown: evaluation.capacityBreakdown,
        historySummary: evaluation.historySummary,
        policySnapshot: evaluation.policySnapshot,
        recommendedInstallment: evaluation.recommendedInstallment,
      },
      evaluated_by: params.userId ?? null,
      valid_until: validUntil,
    });

    return evaluation;
  } catch {
    return null;
  }
}
