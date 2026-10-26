"use server";

import { revalidatePath } from "next/cache";
import { newFinancingTerms } from "@/modules/financing/term-policy";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getTenantAccess } from "@/lib/security/tenant-access";
import { computeAndPersistCustomerEvaluation } from "@/modules/credit-evaluation/service";
import { DEFAULT_CREDIT_POLICY_SETTINGS } from "@/modules/credit-evaluation/engine";

const uuidSchema = z.string().uuid();

export type RecalculateEvaluationState = { state: string } | null;

export async function recalculateCustomerEvaluation(
  _previousState: RecalculateEvaluationState,
  formData: FormData,
): Promise<RecalculateEvaluationState> {
  const access = await getTenantAccess("customers.write");
  if (!access.ok) {
    if (access.reason === "unauthenticated") redirect("/login");
    return { state: access.reason };
  }

  const customerId = String(formData.get("customerId") ?? "");
  if (!uuidSchema.safeParse(customerId).success) {
    return { state: "invalid" };
  }

  const { data: customer } = await access.supabase
    .from("customers")
    .select("id,branch_id")
    .eq("tenant_id", access.membership.tenant_id)
    .eq("id", customerId)
    .maybeSingle();

  if (!customer) return { state: "not-found" };
  if (
    access.membership.role !== "tenant_admin" &&
    access.membership.branch_id &&
    customer.branch_id !== access.membership.branch_id
  ) {
    return { state: "forbidden" };
  }

  const evaluation = await computeAndPersistCustomerEvaluation({
    supabase: access.supabase,
    tenantId: access.membership.tenant_id,
    customerId,
    userId: access.userId,
    triggerEvent: "manual_recalculation",
  });

  if (!evaluation) return { state: "save-error" };

  revalidatePath(`/clientes/${customerId}`);
  revalidatePath("/clientes");
  redirect(`/clientes/${customerId}?evaluacion=recalculada`);
}

const creditPolicySchema = z.object({
  weightPaymentCapacity: z.coerce.number().int().min(0).max(100),
  weightPaymentHistory: z.coerce.number().int().min(0).max(100),
  weightIncomeStability: z.coerce.number().int().min(0).max(100),
  weightCurrentIndebtedness: z.coerce.number().int().min(0).max(100),
  weightIdentityVerification: z.coerce.number().int().min(0).max(100),
  lowRiskMin: z.coerce.number().int().min(50).max(100),
  moderateLowRiskMin: z.coerce.number().int().min(30).max(95),
  reviewRequiredMin: z.coerce.number().int().min(10).max(85),
  maxDebtToIncomePercent: z.string().trim().regex(/^\d{1,2}(?:\.\d{1,2})?$/).refine((val) => Number(val) >= 10 && Number(val) <= 80),
  defaultEvaluationTermMonths: z.coerce.number().int().refine((val) => [3, 5, 6, 8, 12, 18, 24].includes(val)),
  evaluationValidityDays: z.coerce.number().int().min(1).max(365),
  requireManualReviewOverLimit: z.enum(["on", ""]),
  requireManualReviewForHighRisk: z.enum(["on", ""]),
  requireManualReviewForUnverifiedIncome: z.enum(["on", ""]),
});

export type CreditPolicyActionState = { state: string } | null;

export async function saveCreditPolicySettings(
  _previousState: CreditPolicyActionState,
  formData: FormData,
): Promise<CreditPolicyActionState> {
  const access = await getTenantAccess("settings.manage");
  if (!access.ok) {
    if (access.reason === "unauthenticated") redirect("/login");
    return { state: access.reason };
  }

  const parsed = creditPolicySchema.safeParse({
    weightPaymentCapacity: formData.get("weightPaymentCapacity"),
    weightPaymentHistory: formData.get("weightPaymentHistory"),
    weightIncomeStability: formData.get("weightIncomeStability"),
    weightCurrentIndebtedness: formData.get("weightCurrentIndebtedness"),
    weightIdentityVerification: formData.get("weightIdentityVerification"),
    lowRiskMin: formData.get("lowRiskMin"),
    moderateLowRiskMin: formData.get("moderateLowRiskMin"),
    reviewRequiredMin: formData.get("reviewRequiredMin"),
    maxDebtToIncomePercent: String(formData.get("maxDebtToIncomePercent") ?? ""),
    defaultEvaluationTermMonths: formData.get("defaultEvaluationTermMonths"),
    evaluationValidityDays: formData.get("evaluationValidityDays"),
    requireManualReviewOverLimit: String(formData.get("requireManualReviewOverLimit") ?? ""),
    requireManualReviewForHighRisk: String(formData.get("requireManualReviewForHighRisk") ?? ""),
    requireManualReviewForUnverifiedIncome: String(formData.get("requireManualReviewForUnverifiedIncome") ?? ""),
  });

  if (!parsed.success) return { state: "policy-invalid" };

  const totalWeights =
    parsed.data.weightPaymentCapacity +
    parsed.data.weightPaymentHistory +
    parsed.data.weightIncomeStability +
    parsed.data.weightCurrentIndebtedness +
    parsed.data.weightIdentityVerification;

  if (
    totalWeights !== 100 ||
    !(parsed.data.lowRiskMin > parsed.data.moderateLowRiskMin && parsed.data.moderateLowRiskMin > parsed.data.reviewRequiredMin)
  ) {
    return { state: "policy-invalid" };
  }

  const creditPolicy = {
    weights: {
      paymentCapacity: parsed.data.weightPaymentCapacity,
      paymentHistory: parsed.data.weightPaymentHistory,
      incomeStability: parsed.data.weightIncomeStability,
      currentIndebtedness: parsed.data.weightCurrentIndebtedness,
      identityVerification: parsed.data.weightIdentityVerification,
    },
    thresholds: {
      lowRiskMin: parsed.data.lowRiskMin,
      moderateLowRiskMin: parsed.data.moderateLowRiskMin,
      reviewRequiredMin: parsed.data.reviewRequiredMin,
    },
    maxDebtToIncomePercent: Number(parsed.data.maxDebtToIncomePercent).toFixed(2),
    defaultEvaluationTermMonths: parsed.data.defaultEvaluationTermMonths,
    evaluationValidityDays: parsed.data.evaluationValidityDays,
    requireManualReviewOverLimit: parsed.data.requireManualReviewOverLimit === "on",
    requireManualReviewForHighRisk: parsed.data.requireManualReviewForHighRisk === "on",
    requireManualReviewForUnverifiedIncome: parsed.data.requireManualReviewForUnverifiedIncome === "on",
  };

  const { data: existing } = await access.supabase
    .from("financing_settings")
    .select("down_payment_percent,annual_rate_percent,legal_expenses,allowed_terms,recovery_target_percent,recovery_enabled")
    .eq("tenant_id", access.membership.tenant_id)
    .maybeSingle();

  const { error } = await access.supabase.from("financing_settings").upsert(
    {
      tenant_id: access.membership.tenant_id,
      down_payment_percent: existing?.down_payment_percent ?? DEFAULT_CREDIT_POLICY_SETTINGS.downPaymentPercent,
      annual_rate_percent: existing?.annual_rate_percent ?? DEFAULT_CREDIT_POLICY_SETTINGS.annualRatePercent,
      legal_expenses: existing?.legal_expenses ?? DEFAULT_CREDIT_POLICY_SETTINGS.legalExpenses,
      allowed_terms: newFinancingTerms(existing?.allowed_terms ?? DEFAULT_CREDIT_POLICY_SETTINGS.allowedTerms),
      recovery_target_percent: existing?.recovery_target_percent ?? DEFAULT_CREDIT_POLICY_SETTINGS.recoveryTargetPercent,
      recovery_enabled: existing?.recovery_enabled ?? DEFAULT_CREDIT_POLICY_SETTINGS.recoveryEnabled,
      credit_policy: creditPolicy,
      updated_by: access.userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id" },
  );

  if (error) return { state: "policy-save-error" };

  revalidatePath("/configuracion");
  revalidatePath("/clientes");
  revalidatePath("/solicitudes/nueva");
  redirect("/configuracion?estado=politica-guardada");
}
