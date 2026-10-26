"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getTenantAccess } from "@/lib/security/tenant-access";
import { computeAndPersistCustomerEvaluation } from "@/modules/credit-evaluation/service";

import { formatIdentityInput } from "@/modules/financing/input-format";

const optionalText = (max: number) => z.string().trim().max(max).transform((value) => value || null);
const optionalMoney = z.string().trim().max(20).transform((value) => {
  if (!value) return null;
  return value.replace(/,/g, "");
}).refine((value) => value === null || /^\d+(?:\.\d{1,2})?$/.test(value));

const optionalNonNegativeInt = z.string().trim().max(10).transform((value) => {
  if (!value) return null;
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) ? -1 : n;
}).refine((value) => value === null || (Number.isInteger(value) && value >= 0 && value <= 1200));

const verificationStatusSchema = z.string().trim().transform((value) => {
  if (value === "verified" || value === "pending") return value;
  return "declared";
});

const customerSchema = z.object({
  fullName: z.string().trim().min(2).max(200),
  identityNumber: optionalText(40),
  phone: optionalText(40),
  address: optionalText(500),
  socialMedia: optionalText(300),
  homeLocation: optionalText(500),
  occupation: optionalText(160),
  employmentType: optionalText(40),
  employer: optionalText(160),
  employmentTenureMonths: optionalNonNegativeInt,
  monthlyIncome: optionalMoney,
  verifiedMonthlyIncome: optionalMoney,
  otherVerifiableIncome: optionalMoney,
  essentialMonthlyExpenses: optionalMoney,
  existingMonthlyDebts: optionalMoney,
  verifiedMonthlyDebts: optionalMoney,
  dependentsCount: optionalNonNegativeInt,
  housingType: optionalText(40),
  monthlyRentExpense: optionalMoney,
  referenceName: optionalText(160),
  referenceIdentityNumber: z.string().trim().transform(formatIdentityInput).refine(value => !value || /^\d{3}-\d{7}-\d$/.test(value)).transform(value => value || null),
  referencePhone: optionalText(40),
  workReferenceName: optionalText(160),
  workReferencePhone: optionalText(40),
  incomeVerificationStatus: verificationStatusSchema,
  identityVerificationStatus: verificationStatusSchema,
  employmentVerificationStatus: verificationStatusSchema,
  financialDataConsent: z.boolean(),
  branchId: z.string().optional(),
});

function customerValues(formData: FormData) {
  return customerSchema.safeParse({
    fullName: String(formData.get("fullName") ?? ""),
    identityNumber: String(formData.get("identityNumber") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    address: String(formData.get("address") ?? ""),
    socialMedia: String(formData.get("socialMedia") ?? ""),
    homeLocation: String(formData.get("homeLocation") ?? ""),
    occupation: String(formData.get("occupation") ?? ""),
    employmentType: String(formData.get("employmentType") ?? ""),
    employer: String(formData.get("employer") ?? ""),
    employmentTenureMonths: String(formData.get("employmentTenureMonths") ?? ""),
    monthlyIncome: String(formData.get("monthlyIncome") ?? ""),
    verifiedMonthlyIncome: String(formData.get("verifiedMonthlyIncome") ?? ""),
    otherVerifiableIncome: String(formData.get("otherVerifiableIncome") ?? ""),
    essentialMonthlyExpenses: String(formData.get("essentialMonthlyExpenses") ?? ""),
    existingMonthlyDebts: String(formData.get("existingMonthlyDebts") ?? ""),
    verifiedMonthlyDebts: String(formData.get("verifiedMonthlyDebts") ?? ""),
    dependentsCount: String(formData.get("dependentsCount") ?? ""),
    housingType: String(formData.get("housingType") ?? ""),
    monthlyRentExpense: String(formData.get("monthlyRentExpense") ?? ""),
    referenceName: String(formData.get("referenceName") ?? ""),
    referenceIdentityNumber: String(formData.get("referenceIdentityNumber") ?? ""),
    referencePhone: String(formData.get("referencePhone") ?? ""),
    workReferenceName: String(formData.get("workReferenceName") ?? ""),
    workReferencePhone: String(formData.get("workReferencePhone") ?? ""),
    incomeVerificationStatus: String(formData.get("incomeVerificationStatus") ?? "declared"),
    identityVerificationStatus: String(formData.get("identityVerificationStatus") ?? "declared"),
    employmentVerificationStatus: String(formData.get("employmentVerificationStatus") ?? "declared"),
    financialDataConsent: formData.get("financialDataConsent") === "on" || formData.get("financialDataConsent") === "true",
    branchId: String(formData.get("branchId") ?? ""),
  });
}

function actionUrl(reason: string) {
  return `/clientes?estado=${encodeURIComponent(reason)}`;
}

export type CustomerActionState = { state: string } | null;

export async function createCustomer(_previousState: CustomerActionState, formData: FormData): Promise<CustomerActionState> {
  const access = await getTenantAccess("customers.write");
  if (!access.ok) {
    if (access.reason === "unauthenticated") redirect("/login");
    return { state: access.reason };
  }

  const parsed = customerValues(formData);
  if (!parsed.success) return { state: "invalid" };
  const canChooseAnyBranch = access.membership.role === "tenant_admin";
  const branchId = canChooseAnyBranch ? parsed.data.branchId ?? "" : access.membership.branch_id ?? parsed.data.branchId ?? "";
  if (!z.string().uuid().safeParse(branchId).success || (!canChooseAnyBranch && access.membership.branch_id && parsed.data.branchId !== access.membership.branch_id)) return { state: "branch-required" };
  const { data: branch } = await access.supabase.from("branches").select("id").eq("tenant_id", access.membership.tenant_id).eq("id", branchId).maybeSingle();
  if (!branch) return { state: "branch-required" };

  const nowIso = new Date().toISOString();
  const { data: inserted, error } = await access.supabase.from("customers").insert({
    tenant_id: access.membership.tenant_id,
    branch_id: branchId,
    full_name: parsed.data.fullName,
    identity_number: parsed.data.identityNumber,
    phone: parsed.data.phone,
    address: parsed.data.address,
    social_media: parsed.data.socialMedia,
    home_location: parsed.data.homeLocation,
    occupation: parsed.data.occupation,
    employment_type: parsed.data.employmentType,
    employer: parsed.data.employer,
    employment_tenure_months: parsed.data.employmentTenureMonths,
    monthly_income: parsed.data.monthlyIncome,
    verified_monthly_income: parsed.data.verifiedMonthlyIncome,
    other_verifiable_income: parsed.data.otherVerifiableIncome,
    essential_monthly_expenses: parsed.data.essentialMonthlyExpenses,
    existing_monthly_debts: parsed.data.existingMonthlyDebts,
    verified_monthly_debts: parsed.data.verifiedMonthlyDebts,
    dependents_count: parsed.data.dependentsCount,
    housing_type: parsed.data.housingType,
    monthly_rent_expense: parsed.data.monthlyRentExpense,
    reference_name: parsed.data.referenceName,
    reference_identity_number: parsed.data.referenceIdentityNumber,
    reference_phone: parsed.data.referencePhone,
    work_reference_name: parsed.data.workReferenceName,
    work_reference_phone: parsed.data.workReferencePhone,
    income_verification_status: parsed.data.incomeVerificationStatus,
    identity_verification_status: parsed.data.identityVerificationStatus,
    employment_verification_status: parsed.data.employmentVerificationStatus,
    financial_data_consent: parsed.data.financialDataConsent,
    financial_data_consent_at: parsed.data.financialDataConsent ? nowIso : null,
  }).select("id").maybeSingle();

  if (error) return { state: error.code === "23505" ? "duplicate" : "save-error" };
  if (inserted?.id) {
    await computeAndPersistCustomerEvaluation({
      supabase: access.supabase,
      tenantId: access.membership.tenant_id,
      customerId: inserted.id,
      userId: access.userId,
      triggerEvent: "customer_created",
    });
  }
  revalidatePath("/clientes");
  redirect(actionUrl("creado"));
}

export async function updateCustomer(_previousState: CustomerActionState, formData: FormData): Promise<CustomerActionState> {
  const access = await getTenantAccess("customers.write");
  if (!access.ok) {
    if (access.reason === "unauthenticated") redirect("/login");
    return { state: access.reason };
  }

  const id = String(formData.get("id") ?? "");
  const parsed = customerValues(formData);
  if (!z.string().uuid().safeParse(id).success || !parsed.success) return { state: "invalid" };
  const { data: target, error: targetError } = await access.supabase.from("customers")
    .select("branch_id,financial_data_consent_at").eq("id", id).eq("tenant_id", access.membership.tenant_id).maybeSingle();
  if (targetError) return { state: "save-error" };
  if (!target) return { state: "not-found" };
  if (access.membership.role !== "tenant_admin" && access.membership.branch_id && target.branch_id !== access.membership.branch_id) return { state: "forbidden" };

  const nowIso = new Date().toISOString();
  const { data, error } = await access.supabase.from("customers").update({
    full_name: parsed.data.fullName,
    identity_number: parsed.data.identityNumber,
    phone: parsed.data.phone,
    address: parsed.data.address,
    social_media: parsed.data.socialMedia,
    home_location: parsed.data.homeLocation,
    occupation: parsed.data.occupation,
    employment_type: parsed.data.employmentType,
    employer: parsed.data.employer,
    employment_tenure_months: parsed.data.employmentTenureMonths,
    monthly_income: parsed.data.monthlyIncome,
    verified_monthly_income: parsed.data.verifiedMonthlyIncome,
    other_verifiable_income: parsed.data.otherVerifiableIncome,
    essential_monthly_expenses: parsed.data.essentialMonthlyExpenses,
    existing_monthly_debts: parsed.data.existingMonthlyDebts,
    verified_monthly_debts: parsed.data.verifiedMonthlyDebts,
    dependents_count: parsed.data.dependentsCount,
    housing_type: parsed.data.housingType,
    monthly_rent_expense: parsed.data.monthlyRentExpense,
    reference_name: parsed.data.referenceName,
    reference_identity_number: parsed.data.referenceIdentityNumber,
    reference_phone: parsed.data.referencePhone,
    work_reference_name: parsed.data.workReferenceName,
    work_reference_phone: parsed.data.workReferencePhone,
    income_verification_status: parsed.data.incomeVerificationStatus,
    identity_verification_status: parsed.data.identityVerificationStatus,
    employment_verification_status: parsed.data.employmentVerificationStatus,
    financial_data_consent: parsed.data.financialDataConsent,
    financial_data_consent_at: parsed.data.financialDataConsent
      ? (target.financial_data_consent_at ?? nowIso)
      : null,
    updated_at: nowIso,
  }).eq("id", id).eq("tenant_id", access.membership.tenant_id).select("id").maybeSingle();

  if (error) return { state: "save-error" };
  if (!data) return { state: "not-found" };

  await computeAndPersistCustomerEvaluation({
    supabase: access.supabase,
    tenantId: access.membership.tenant_id,
    customerId: id,
    userId: access.userId,
    triggerEvent: "customer_updated",
  });

  revalidatePath("/clientes");
  revalidatePath(`/clientes/${id}`);
  redirect(`/clientes/${id}?evaluacion=actualizada`);
}

