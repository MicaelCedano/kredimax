"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getTenantAccess } from "@/lib/security/tenant-access";
import { PaymentEvidenceError, readPaymentEvidence } from "@/modules/payments/evidence";
import { calculateFinancingQuote, DEFAULT_FINANCING_SETTINGS, hasAdvisoryRecovery, parseMoneyToCents, resolveDownPaymentPercent, type FinancingSettings } from "@/modules/financing/calculator";
import { isValidImei } from "@/lib/validation/imei";
import { newFinancingTerms } from "@/modules/financing/term-policy";
import { firstPaymentDate } from "@/modules/financing/schedule-dates";
import { isoDateInTimeZone } from "@/lib/business-date";
import { sanitizeSearchTerm } from "@/lib/validation/search-term";
import { applicationIssueFields } from "@/modules/financing/application-errors";
import { applicationIncomeSources, businessDocumentRequirements } from "@/modules/financing/application-income";
import { applicationDriveFileId, readBusinessApplicationDocuments, type BusinessApplicationDocument } from "@/modules/financing/application-documents";
import { isApplicationDriveConfigured, uploadBusinessApplicationDocuments } from "@/lib/financing/application-drive.server";
import { evaluateCustomerCredit, riskLabelForLevel, type CreditRiskLevel, type VerificationStatus } from "@/modules/credit-evaluation/engine";
import { computeAndPersistCustomerEvaluation, loadCustomerInternalHistory, loadTenantCreditPolicy } from "@/modules/credit-evaluation/service";
import { formatIdentityInput, formatPhoneInput, normalizeMoneyInput, REFERENCE_RELATIONSHIPS, uppercaseCustomerName } from "@/modules/financing/input-format";
import { loadHandoverContext } from "@/modules/financing/handover-context.server";
import { isProvisionalActReference, missingHandoverFields } from "@/modules/financing/handover-requirements";

const uuidSchema = z.string().uuid();
const incomeSourceSchema = z.enum(applicationIncomeSources.map(({ value }) => value));
const optionalCustomerText = (max: number) => z.string().trim().max(max).transform((value) => value || null);
const newCustomerSchema = z.object({
  fullName: z.string().trim().transform(uppercaseCustomerName).pipe(z.string().min(2).max(200)),
  identityNumber: z.string().trim().transform(formatIdentityInput).pipe(optionalCustomerText(40)),
  phone: z.string().trim().transform(formatPhoneInput).pipe(optionalCustomerText(40)),
  address: optionalCustomerText(500),
});
const applicationSchema = z.object({
  submissionKey: uuidSchema.transform((key) => key.toLowerCase()),
  customerMode: z.enum(["existing", "new"]),
  customerId: z.string(),
  customerFullName: z.string(),
  customerIdentityNumber: z.string(),
  customerPhone: z.string(),
  customerAddress: z.string(),
  branchId: z.string(),
  brand: z.string().trim().min(1).max(80),
  model: z.string().trim().min(1).max(120),
  imei: z.string().trim().regex(/^\d{15}$/, "El IMEI debe tener exactamente 15 dígitos numéricos.").refine(isValidImei, "El IMEI no supera la validación de su dígito de control. Verifica el número real del equipo."),
  condition: z.enum(["new", "used"]),
  salePrice: z.string().transform(normalizeMoneyInput),
  downPaymentPercent: z.string(),
  termMonths: z.coerce.number().int(),
  frequency: z.enum(["monthly", "fortnightly"]),
  firstInstallmentDate: z.string(),
  employer: z.string().trim().max(160),
  monthlyIncome: z.string().transform(normalizeMoneyInput),
  referenceName: z.string().trim().max(160),
  referenceIdentityNumber: z.string().trim().transform(formatIdentityInput).refine(value => !value || /^\d{3}-\d{7}-\d$/.test(value), "Escribe una cédula de referencia de 11 dígitos."),
  referenceRelationship: z.enum(["", ...REFERENCE_RELATIONSHIPS]),
  referencePhone: z.string().trim().transform(formatPhoneInput).pipe(z.string().max(40)),
  referenceConsent: z.enum(["on", ""]),
});

function value(formData: FormData, key: string) {
  const field = formData.get(key);
  return typeof field === "string" ? field : "";
}

function settingsValues(settings: {
  down_payment_percent: string;
  annual_rate_percent: string;
  legal_expenses: string;
  allowed_terms: number[];
  recovery_target_percent: string;
  recovery_enabled: boolean;
} | null): FinancingSettings {
  return settings ? {
    downPaymentPercent: String(settings.down_payment_percent ?? ""),
    annualRatePercent: String(settings.annual_rate_percent ?? ""),
    legalExpenses: String(settings.legal_expenses ?? ""),
    allowedTerms: newFinancingTerms(settings.allowed_terms),
    recoveryTargetPercent: String(settings.recovery_target_percent ?? ""),
    recoveryEnabled: settings.recovery_enabled,
  } : { ...DEFAULT_FINANCING_SETTINGS, allowedTerms: [...DEFAULT_FINANCING_SETTINGS.allowedTerms] };
}

export type CustomerCreditSummaryForApplication = {
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
  evaluatedAt: string | null;
};

async function attachCustomerEvaluations<
  T extends {
    id: string;
    identity_number: string | null;
    phone: string | null;
    address: string | null;
    employer?: string | null;
    monthly_income?: string | number | null;
    occupation?: string | null;
    employment_type?: string | null;
    employment_tenure_months?: number | null;
    verified_monthly_income?: string | number | null;
    other_verifiable_income?: string | number | null;
    essential_monthly_expenses?: string | number | null;
    existing_monthly_debts?: string | number | null;
    verified_monthly_debts?: string | number | null;
    dependents_count?: number | null;
    housing_type?: string | null;
    monthly_rent_expense?: string | number | null;
    reference_name?: string | null;
    reference_phone?: string | null;
    work_reference_name?: string | null;
    work_reference_phone?: string | null;
    income_verification_status?: string | null;
    identity_verification_status?: string | null;
    employment_verification_status?: string | null;
    financial_data_consent?: boolean | null;
  },
>(
  supabase: Parameters<typeof loadTenantCreditPolicy>[0],
  tenantId: string,
  customers: T[],
): Promise<(T & { credit_evaluation: CustomerCreditSummaryForApplication })[]> {
  if (!customers.length) return [];
  const customerIds = customers.map((c) => c.id);
  const [{ data: savedEvaluations }, policy] = await Promise.all([
    supabase
      .from("customer_credit_evaluations")
      .select(
        "customer_id,status,total_score,risk_level,verification_state,monthly_payment_capacity,recommended_max_principal,recommended_max_sale_price,recommended_down_payment,recommended_term_months,created_at",
      )
      .eq("tenant_id", tenantId)
      .in("customer_id", customerIds)
      .order("created_at", { ascending: false }),
    loadTenantCreditPolicy(supabase, tenantId),
  ]);

  const latestByCustomer = new Map<string, NonNullable<typeof savedEvaluations>[number]>();
  for (const row of savedEvaluations ?? []) {
    if (!latestByCustomer.has(row.customer_id)) {
      latestByCustomer.set(row.customer_id, row);
    }
  }

  return await Promise.all(
    customers.map(async (customer) => {
      const saved = latestByCustomer.get(customer.id);
      if (saved) {
        const riskLevel = (saved.risk_level as CreditRiskLevel) ?? "unrated";
        return {
          ...customer,
          credit_evaluation: {
            status: (saved.status as "complete" | "incomplete") ?? "incomplete",
            totalScore: saved.total_score,
            riskLevel,
            riskLabel: riskLabelForLevel(riskLevel),
            verificationState: (saved.verification_state as VerificationStatus) ?? "declared",
            monthlyPaymentCapacity: String(saved.monthly_payment_capacity ?? "0.00"),
            recommendedMaxPrincipal: String(saved.recommended_max_principal ?? "0.00"),
            recommendedMaxSalePrice: String(saved.recommended_max_sale_price ?? "0.00"),
            recommendedDownPayment: String(saved.recommended_down_payment ?? "0.00"),
            recommendedTermMonths: saved.recommended_term_months ?? policy.defaultEvaluationTermMonths,
            evaluatedAt: saved.created_at ?? null,
          },
        };
      }

      const history = await loadCustomerInternalHistory(supabase, tenantId, customer.id);
      const computed = evaluateCustomerCredit(
        {
          identityNumber: customer.identity_number,
          phone: customer.phone,
          address: customer.address,
          occupation: customer.occupation,
          employmentType: customer.employment_type,
          employer: customer.employer,
          employmentTenureMonths: customer.employment_tenure_months,
          declaredMonthlyIncome: customer.monthly_income,
          verifiedMonthlyIncome: customer.verified_monthly_income,
          otherVerifiableIncome: customer.other_verifiable_income,
          essentialMonthlyExpenses: customer.essential_monthly_expenses,
          existingMonthlyDebts: customer.existing_monthly_debts,
          verifiedMonthlyDebts: customer.verified_monthly_debts,
          dependentsCount: customer.dependents_count,
          housingType: customer.housing_type,
          monthlyRentExpense: customer.monthly_rent_expense,
          referenceName: customer.reference_name,
          referencePhone: customer.reference_phone,
          workReferenceName: customer.work_reference_name,
          workReferencePhone: customer.work_reference_phone,
          incomeVerificationStatus: customer.income_verification_status,
          identityVerificationStatus: customer.identity_verification_status,
          employmentVerificationStatus: customer.employment_verification_status,
          financialDataConsent: customer.financial_data_consent,
        },
        history,
        policy,
      );

      return {
        ...customer,
        credit_evaluation: {
          status: computed.status,
          totalScore: computed.totalScore,
          riskLevel: computed.riskLevel,
          riskLabel: computed.riskLabel,
          verificationState: computed.verificationState,
          monthlyPaymentCapacity: computed.monthlyPaymentCapacity,
          recommendedMaxPrincipal: computed.recommendedMaxPrincipal,
          recommendedMaxSalePrice: computed.recommendedMaxSalePrice,
          recommendedDownPayment: computed.recommendedDownPayment,
          recommendedTermMonths: computed.recommendedTermMonths,
          evaluatedAt: null,
        },
      };
    }),
  );
}

const CUSTOMER_APPLICATION_SELECT =
  "id,branch_id,full_name,identity_number,phone,address,employer,monthly_income,reference_name,reference_phone,reference_relationship,reference_identity_number,occupation,employment_type,employment_tenure_months,verified_monthly_income,other_verifiable_income,essential_monthly_expenses,existing_monthly_debts,verified_monthly_debts,dependents_count,housing_type,monthly_rent_expense,work_reference_name,work_reference_phone,income_verification_status,identity_verification_status,employment_verification_status,financial_data_consent";

export async function lookupCustomerByIdentityNumber(identityNumber: string) {
  const normalizedIdentityNumber = identityNumber.trim();
  if (normalizedIdentityNumber.length < 6 || normalizedIdentityNumber.length > 40) return { status: "not-found" as const };

  const [financingAccess, customerAccess] = await Promise.all([
    getTenantAccess("financing.write"),
    getTenantAccess("customers.read"),
  ]);
  if (!financingAccess.ok || !customerAccess.ok || financingAccess.membership.tenant_id !== customerAccess.membership.tenant_id) {
    return { status: "unavailable" as const };
  }

  const { data, error } = await customerAccess.supabase.rpc("lookup_customer_by_identity", {
    p_tenant_id: financingAccess.membership.tenant_id,
    p_identity_number: normalizedIdentityNumber,
  });
  if (error) return { status: "unavailable" as const };
  if (!data?.length) return { status: "not-found" as const };
  if (data.length > 1) return { status: "ambiguous" as const };

  const matched = data[0];
  const { data: fullCustomer } = await customerAccess.supabase.from("customers")
    .select(CUSTOMER_APPLICATION_SELECT)
    .eq("tenant_id", financingAccess.membership.tenant_id)
    .eq("id", matched.id)
    .maybeSingle();

  const [enriched] = await attachCustomerEvaluations(
    customerAccess.supabase,
    financingAccess.membership.tenant_id,
    [fullCustomer ?? { ...matched, branch_id: null }],
  );

  return { status: "found" as const, customer: enriched };
}

export async function searchCustomersForApplication(query: string, offset = 0) {
  const term = sanitizeSearchTerm(query);
  const safeOffset = Number.isSafeInteger(offset) ? Math.max(0, Math.min(offset, 100_000)) : 0;
  if (term.length < 2) return { status: "ok" as const, customers: [], hasMore: false };
  const access = await getTenantAccess("customers.read");
  if (!access.ok) return { status: access.reason, customers: [], hasMore: false };
  const pageSize = 25;
  const { data, error, count } = await access.supabase.from("customers")
    .select(CUSTOMER_APPLICATION_SELECT, { count: "exact" })
    .eq("tenant_id", access.membership.tenant_id)
    .or(`full_name.ilike.%${term}%,identity_number.ilike.%${term}%,phone.ilike.%${term}%,employer.ilike.%${term}%`)
    .order("full_name", { ascending: true })
    .range(safeOffset, safeOffset + pageSize - 1);
  if (error) return { status: "unavailable" as const, customers: [], hasMore: false };

  const enriched = await attachCustomerEvaluations(access.supabase, access.membership.tenant_id, data ?? []);
  return { status: "ok" as const, customers: enriched, hasMore: count !== null && safeOffset + (data?.length ?? 0) < count };
}

export type CreditApplicationActionState = { state: string; fieldErrors?: Record<string, string> } | null;

export async function createCreditApplication(_previousState: CreditApplicationActionState, formData: FormData): Promise<CreditApplicationActionState> {
  const access = await getTenantAccess("financing.write");
  if (!access.ok) {
    if (access.reason === "unauthenticated") redirect("/login");
    return { state: access.reason };
  }

  const parsed = applicationSchema.safeParse(Object.fromEntries([
    "submissionKey", "customerMode", "customerId", "customerFullName", "customerIdentityNumber", "customerPhone", "customerAddress", "branchId", "brand", "model", "imei", "condition",
    "salePrice", "downPaymentPercent", "termMonths", "frequency", "firstInstallmentDate", "employer", "monthlyIncome",
    "referenceName", "referencePhone", "referenceRelationship", "referenceIdentityNumber", "referenceConsent",
  ].map((key) => [key, value(formData, key)])));
  if (!parsed.success) return { state: "invalid-form", fieldErrors: applicationIssueFields(parsed.error.issues) };

  const incomeSource = parsed.data.customerMode === "new" ? incomeSourceSchema.safeParse(value(formData, "incomeSource")) : null;
  if (incomeSource && !incomeSource.success) {
    return { state: "invalid-form", fieldErrors: { incomeSource: "Selecciona Empleado o Negocio propio." } };
  }
  let businessDocuments: BusinessApplicationDocument[] = [];
  if (incomeSource?.data === "business_owner") {
    const result = await readBusinessApplicationDocuments(formData);
    if (result.fieldErrors) return { state: "business-documents-invalid", fieldErrors: result.fieldErrors };
    businessDocuments = result.documents;
  }

  let customer: { id: string | null; branch_id: string | null; full_name: string; identity_number: string | null; phone: string | null; address: string | null } | null = null;
  if (parsed.data.customerMode === "existing") {
    if (!uuidSchema.safeParse(parsed.data.customerId).success) return { state: "invalid-form", fieldErrors: { customerId: "Busca y selecciona el expediente del cliente." } };
    const { data, error } = await access.supabase.from("customers").select("id,branch_id,full_name,identity_number,phone,address").eq("id", parsed.data.customerId).eq("tenant_id", access.membership.tenant_id).maybeSingle();
    if (error) return { state: "unavailable" };
    if (!data) return { state: "customer-not-found" };
    customer = data;
  } else {
    const parsedCustomer = newCustomerSchema.safeParse({
      fullName: parsed.data.customerFullName,
      identityNumber: parsed.data.customerIdentityNumber,
      phone: parsed.data.customerPhone,
      address: parsed.data.customerAddress,
    });
    if (!parsedCustomer.success) return { state: "invalid-customer", fieldErrors: applicationIssueFields(parsedCustomer.error.issues.map(issue => ({ ...issue, path: [new Map([["fullName", "customerFullName"], ["identityNumber", "customerIdentityNumber"], ["phone", "customerPhone"], ["address", "customerAddress"]]).get(String(issue.path[0])) ?? issue.path[0]] }))) };
    customer = { id: null, branch_id: null, full_name: parsedCustomer.data.fullName, identity_number: parsedCustomer.data.identityNumber, phone: parsedCustomer.data.phone, address: parsedCustomer.data.address };
  }

  const canChooseAnyBranch = access.membership.role === "tenant_admin";
  const branchId = canChooseAnyBranch ? parsed.data.branchId : access.membership.branch_id ?? parsed.data.branchId;
  if (!uuidSchema.safeParse(branchId).success) return { state: "branch-required", fieldErrors: { branchId: "Selecciona una sucursal válida." } };
  if (!canChooseAnyBranch && access.membership.branch_id && parsed.data.branchId !== access.membership.branch_id) return { state: "forbidden" };
  if (parsed.data.customerMode === "existing" && customer.branch_id !== branchId) return { state: "customer-branch-mismatch", fieldErrors: { branchId: "Usa la sucursal asignada al cliente." } };
  const { data: selectedBranch, error: branchError } = await access.supabase.from("branches")
    .select("id,name").eq("tenant_id", access.membership.tenant_id).eq("id", branchId).maybeSingle();
  if (branchError || !selectedBranch) return { state: "forbidden" };

  const { data: settingsRow, error: settingsError } = await access.supabase.from("financing_settings").select("down_payment_percent,annual_rate_percent,legal_expenses,allowed_terms,recovery_target_percent,recovery_enabled").eq("tenant_id", access.membership.tenant_id).maybeSingle();
  if (settingsError) return { state: "unavailable" };
  if (!customer) return { state: "customer-not-found" };
  const settings = settingsValues(settingsRow);
  let downPaymentPercent;
  try { downPaymentPercent = resolveDownPaymentPercent(parsed.data.downPaymentPercent, settings.downPaymentPercent); }
  catch { return { state: "invalid-form", fieldErrors: { downPaymentPercent: "Selecciona un porcentaje de inicial disponible." } }; }
  if (!settings.allowedTerms.some((term) => term === parsed.data.termMonths)) return { state: "term-not-allowed", fieldErrors: { termMonths: "Selecciona uno de los plazos habilitados." } };

  const hasReference = Boolean(parsed.data.referenceName || parsed.data.referencePhone || parsed.data.referenceRelationship || parsed.data.referenceIdentityNumber);
  if (hasReference && parsed.data.referenceConsent !== "on") return { state: "reference-consent-required", fieldErrors: { referenceConsent: "Confirma la autorización para registrar esta referencia." } };
  if (hasReference && (!parsed.data.referenceName || !parsed.data.referencePhone)) return { state: "invalid-reference", fieldErrors: { referenceName: "Completa nombre y teléfono de la referencia, o deja ambos vacíos." } };

  const income = parsed.data.monthlyIncome.trim() ? parsed.data.monthlyIncome.trim() : null;
  if (income) {
    try { if (parseMoneyToCents(income) < 0n) return { state: "invalid-income", fieldErrors: { monthlyIncome: "Escribe un importe válido no negativo." } }; }
    catch { return { state: "invalid-income", fieldErrors: { monthlyIncome: "Escribe un importe válido no negativo." } }; }
  }

  let quote;
  const quoteDate = isoDateInTimeZone(new Date());
  try {
    quote = calculateFinancingQuote({
      salePrice: parsed.data.salePrice,
      deviceCost: parsed.data.salePrice,
      downPaymentPercent,
      annualRatePercent: settings.annualRatePercent,
      legalExpenses: settings.legalExpenses,
      termMonths: parsed.data.termMonths,
      frequency: parsed.data.frequency,
      firstInstallmentDate: firstPaymentDate(quoteDate, parsed.data.frequency),
      today: quoteDate,
      recoveryTargetPercent: settings.recoveryTargetPercent,
      recoveryEnabled: settings.recoveryEnabled,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "";
    console.error("[KrediMax] No se pudo calcular la cotización", error);
    if (reason.includes("primera cuota")) return { state: "quote-date-invalid", fieldErrors: { firstInstallmentDate: "Selecciona una fecha válida para la primera cuota." } };
    if (reason.includes("porcentaje") || reason.includes("inicial") || reason.includes("tasa")) return { state: "quote-settings-invalid" };
    if (reason.includes("precio") || reason.includes("monto")) return { state: "quote-price-invalid", fieldErrors: { salePrice: "Escribe un precio de venta válido, con hasta dos decimales." } };
    if (reason.includes("plazo")) return { state: "quote-term-invalid" };
    return { state: "quote-invalid" };
  }

  if (!hasAdvisoryRecovery(quote.paymentDistribution) && !quote.recoveryMet) return { state: "recovery-review-required" };
  const quoteSnapshot = {
    version: 1,
    applicant: {
      customerName: uppercaseCustomerName(customer.full_name),
      identityNumber: customer.identity_number,
      phone: customer.phone,
      address: customer.address,
      employer: parsed.data.employer || null,
      monthlyIncome: income,
      ...(incomeSource?.data ? { incomeSource: incomeSource.data } : {}),
      reference: hasReference ? { name: parsed.data.referenceName, phone: parsed.data.referencePhone, identityNumber: parsed.data.referenceIdentityNumber || null, relationship: parsed.data.referenceRelationship || null, consentRecorded: true } : null,
    },
    device: {
      id: null,
      brand: parsed.data.brand,
      model: parsed.data.model,
      imei: parsed.data.imei,
      condition: parsed.data.condition,
      inventoryBranch: selectedBranch.name,
      costDefaultsToSalePrice: true,
    },
    ...quote,
    recoveryTargetPercent: settings.recoveryTargetPercent,
    adjustmentStatus: quote.adjustmentRequiresApproval ? "requires_commercial_and_legal_approval" : "not_applicable",
  };

  let applicationId: string | null = null;
  let saveError: { code?: string; message: string } | null = null;
  if (parsed.data.customerMode === "new") {
    const customerAccess = await getTenantAccess("customers.write");
    if (!customerAccess.ok) {
      if (customerAccess.reason === "unauthenticated") redirect("/login");
      return { state: customerAccess.reason === "unavailable" ? "unavailable" : "forbidden" };
    }
    if (customerAccess.membership.tenant_id !== access.membership.tenant_id || customerAccess.membership.branch_id !== access.membership.branch_id) return { state: "forbidden" };
    let upload: Awaited<ReturnType<typeof uploadBusinessApplicationDocuments>> | undefined;
    if (businessDocuments.length) {
      const tenantId = access.membership.tenant_id;
      const submissionKey = parsed.data.submissionKey;
      const prior = await access.supabase.from("credit_applications").select("id")
        .eq("tenant_id", tenantId).eq("created_by", access.userId).eq("submission_key", submissionKey).maybeSingle();
      if (prior.error) return { state: "unavailable" };
      if (prior.data) redirect("/solicitudes?estado=creada");
      if (!isApplicationDriveConfigured(tenantId)) return { state: "application-drive-not-configured" };
      try {
        upload = await uploadBusinessApplicationDocuments(businessDocuments, { tenantId, submissionKey, actorId: access.userId });
      } catch {
        return { state: "application-drive-upload-failed" };
      }
    }
    const created = await access.supabase.rpc("create_customer_and_credit_application", {
      p_tenant_id: access.membership.tenant_id,
      p_branch_id: branchId,
      p_customer_full_name: customer.full_name,
      p_customer_identity_number: customer.identity_number,
      p_customer_phone: customer.phone,
      p_customer_address: customer.address,
      p_device_id: null,
      p_requested_amount: quote.principal,
      p_quote_snapshot: upload ? {
        ...quoteSnapshot,
        applicant: { ...quoteSnapshot.applicant, businessDocumentFiles: upload.documents },
      } : quoteSnapshot,
      p_submission_key: parsed.data.submissionKey,
    });
    applicationId = created.data;
    saveError = created.error;
    if (upload) {
      if (saveError?.code && /^(?:22|23|40|42|P0)[A-Z0-9]{3}$/.test(saveError.code)) {
        await upload.discardUnlinked();
      } else if (applicationId && !saveError) {
        // A simultaneous retry may have returned a previously saved application.
        const { data: persisted } = await access.supabase.from("credit_applications").select("quote_snapshot")
          .eq("tenant_id", access.membership.tenant_id).eq("id", applicationId).maybeSingle();
        if (persisted) {
          await upload.discardUnlinked(businessDocumentRequirements.map(({ field }) => applicationDriveFileId(persisted.quote_snapshot, field)));
        }
      }
    }
  } else {
    const created = await access.supabase.rpc("create_credit_application", {
      p_tenant_id: access.membership.tenant_id,
      p_customer_id: customer.id!,
      p_device_id: null,
      p_branch_id: branchId,
      p_requested_amount: quote.principal,
      p_quote_snapshot: quoteSnapshot,
      p_submission_key: parsed.data.submissionKey,
    });
    applicationId = created.data;
    saveError = created.error;
  }
  if (saveError || !applicationId) {
    if (saveError?.message.includes("DEVICE_IMEI_CONFLICT")) return { state: "device-identifier-conflict", fieldErrors: { imei: "Ese IMEI ya está registrado. Verifica el número real del equipo." } };
    if (saveError?.code === "23505") return { state: parsed.data.customerMode === "new" ? "duplicate-customer" : "duplicate" };
    return { state: "save-error" };
  }

  try {
    let targetCustomerId = customer.id;
    if (!targetCustomerId && applicationId) {
      const { data: appRow } = await access.supabase.from("credit_applications")
        .select("customer_id")
        .eq("tenant_id", access.membership.tenant_id)
        .eq("id", applicationId)
        .maybeSingle();
      targetCustomerId = appRow?.customer_id ?? null;
    }
    if (targetCustomerId) {
      if (parsed.data.employer || income || hasReference) {
        const updatePayload: Record<string, string | null> = { updated_at: new Date().toISOString() };
        if (parsed.data.employer) updatePayload.employer = parsed.data.employer;
        if (income) updatePayload.monthly_income = income.replace(/,/g, "");
        if (hasReference) {
          updatePayload.reference_name = parsed.data.referenceName;
          updatePayload.reference_identity_number = parsed.data.referenceIdentityNumber || null;
          updatePayload.reference_phone = parsed.data.referencePhone;
          updatePayload.reference_relationship = parsed.data.referenceRelationship || null;
        }
        await access.supabase.from("customers")
          .update(updatePayload)
          .eq("tenant_id", access.membership.tenant_id)
          .eq("id", targetCustomerId);
      }
      await computeAndPersistCustomerEvaluation({
        supabase: access.supabase,
        tenantId: access.membership.tenant_id,
        customerId: targetCustomerId,
        userId: access.userId,
        triggerEvent: "application_created",
      });
    }
  } catch {
    // Keep application creation resilient even if optional profile sync is skipped.
  }

  revalidatePath("/solicitudes");
  revalidatePath("/clientes");
  revalidatePath("/dispositivos");
  revalidatePath("/dispositivos/[id]", "page");
  redirect("/solicitudes?estado=creada");
}

const settingsSchema = z.object({
  downPaymentPercent: z.string().regex(/^\d{1,3}(?:\.\d{1,2})?$/).refine((value) => Number(value) > 0 && Number(value) <= 100),
  annualRatePercent: z.string().regex(/^\d{1,3}(?:\.\d{1,3})?$/).refine((value) => Number(value) >= 0 && Number(value) <= 100 && (!value.includes(".") || value.split(".")[1].length <= 2 || /^\d{2}0$/.test(value.split(".")[1]))),
  legalExpenses: z.string(),
  allowedTerms: z.array(z.coerce.number().int()).min(1),
  recoveryEnabled: z.enum(["on", ""]),
});

export async function saveFinancingSettings(_previousState: CreditApplicationActionState, formData: FormData): Promise<CreditApplicationActionState> {
  const access = await getTenantAccess("settings.manage");
  if (!access.ok) {
    if (access.reason === "unauthenticated") redirect("/login");
    return { state: access.reason };
  }
  const parsed = settingsSchema.safeParse({
    downPaymentPercent: value(formData, "downPaymentPercent"),
    annualRatePercent: value(formData, "annualRatePercent"),
    legalExpenses: value(formData, "legalExpenses"),
    allowedTerms: formData.getAll("allowedTerms"),
    recoveryEnabled: value(formData, "recoveryEnabled"),
  });
  if (!parsed.success || parsed.data.allowedTerms.some((term) => !DEFAULT_FINANCING_SETTINGS.allowedTerms.some((allowed) => allowed === term))) return { state: "settings-invalid" };
  try { if (parseMoneyToCents(parsed.data.legalExpenses) < 0n) return { state: "settings-invalid" }; }
  catch { return { state: "settings-invalid" }; }

  const { error } = await access.supabase.from("financing_settings").upsert({
    tenant_id: access.membership.tenant_id,
    down_payment_percent: parsed.data.downPaymentPercent,
    annual_rate_percent: parsed.data.annualRatePercent,
    legal_expenses: parsed.data.legalExpenses,
    allowed_terms: [...new Set(parsed.data.allowedTerms)].sort((a, b) => a - b),
    recovery_target_percent: "100.00",
    recovery_enabled: parsed.data.recoveryEnabled === "on",
    updated_by: access.userId,
    updated_at: new Date().toISOString(),
  }, { onConflict: "tenant_id" });
  if (error) return { state: "settings-save-error" };
  revalidatePath("/configuracion");
  revalidatePath("/solicitudes/nueva");
  redirect("/configuracion?estado=guardada");
}

const reviewSchema = z.object({
  applicationId: uuidSchema,
  decision: z.enum(["approved", "rejected", "documents_requested"]),
  notes: z.string().trim().max(2000),
  additionalChargeCategory: z.string().trim().max(100),
  additionalChargeBasis: z.string().trim().max(1000),
  additionalChargeAttested: z.enum(["on", ""]),
});

export type ReviewCreditApplicationState = { state: string } | null;

export async function reviewCreditApplication(_previousState: ReviewCreditApplicationState, formData: FormData): Promise<ReviewCreditApplicationState> {
  const access = await getTenantAccess("financing.approve");
  if (!access.ok) {
    if (access.reason === "unauthenticated") redirect("/login");
    return { state: "forbidden" };
  }
  const parsed = reviewSchema.safeParse(Object.fromEntries([
    "applicationId", "decision", "notes", "additionalChargeCategory", "additionalChargeBasis", "additionalChargeAttested",
  ].map((key) => [key, value(formData, key)])));
  if (!parsed.success) return { state: "review-invalid" };

  const { data: application } = await access.supabase.from("credit_applications")
    .select("id,tenant_id,quote_snapshot")
    .eq("id", parsed.data.applicationId)
    .eq("tenant_id", access.membership.tenant_id)
    .maybeSingle();
  if (!application) return { state: "not-found" };
  const quote = application.quote_snapshot as { proposedAdjustment?: string; recoveryMet?: boolean; paymentDistribution?: string };
  let needsChargeReview = false;
  try { needsChargeReview = parseMoneyToCents(quote.proposedAdjustment ?? "0.00") > 0n; }
  catch { return { state: "review-invalid" }; }
  if (parsed.data.decision === "rejected" && !parsed.data.notes) return { state: "review-note-required" };
  if (parsed.data.decision === "documents_requested" && !parsed.data.notes) return { state: "review-note-required" };
  if (parsed.data.decision === "approved" && needsChargeReview && (!parsed.data.additionalChargeCategory || !parsed.data.additionalChargeBasis || parsed.data.additionalChargeAttested !== "on")) return { state: "additional-charge-approval-required" };
  if (parsed.data.decision === "approved" && !hasAdvisoryRecovery(quote.paymentDistribution) && quote.recoveryMet !== true) return { state: "recovery-review-required" };

  const { error } = await access.supabase.rpc("review_credit_application", {
    p_application_id: parsed.data.applicationId,
    p_decision: parsed.data.decision,
    p_notes: parsed.data.notes || null,
    p_additional_charge_category: parsed.data.additionalChargeCategory || null,
    p_additional_charge_basis: parsed.data.additionalChargeBasis || null,
    p_additional_charge_attested: parsed.data.additionalChargeAttested === "on",
  });
  if (error) return { state: error.message.includes("DEVICE_NOT_IN_INVENTORY") ? "device-not-in-inventory" : error.message.includes("ADDITIONAL_CHARGE") ? "additional-charge-approval-required" : "review-error" };
  revalidatePath("/solicitudes");
  if (parsed.data.decision === "approved") revalidatePath("/mdm");
  revalidatePath(`/solicitudes/${parsed.data.applicationId}`);
  revalidatePath("/dispositivos");
  revalidatePath("/dispositivos/[id]", "page");
  redirect(`/solicitudes/${parsed.data.applicationId}?estado=${parsed.data.decision}`);
}

export type LoanActivationState = { error?: string };

export async function activateApprovedLoan(_previous: LoanActivationState, formData: FormData): Promise<LoanActivationState> {
  const access = await getTenantAccess("financing.activate");
  if (!access.ok) return { error: access.reason === "unauthenticated" ? "Tu sesión expiró. Inicia sesión e inténtalo otra vez." : "No tienes permiso para formalizar en esta sucursal." };
  const parsed = z.object({
    applicationId: uuidSchema,
    loanId: uuidSchema,
    idempotencyKey: uuidSchema,
    paymentMethod: z.enum(["cash", "bank_transfer", "card", "other"]),
    paymentReference: z.string().trim().max(120),
    signedDocumentPath: z.string().trim().min(3).max(1000),
    contractEvidenceAttested: z.literal("on"),
    notarialActAttested: z.literal("on"),
    // A date input's browser `max` is presentation only; Server Actions are
    // public POST entry points, so reject impossible calendar dates here too.
    deliveryDate: z.iso.date(),
  }).safeParse(Object.fromEntries(["applicationId", "loanId", "idempotencyKey", "paymentMethod", "paymentReference", "signedDocumentPath", "contractEvidenceAttested", "notarialActAttested", "deliveryDate"]
    .map((key) => [key, value(formData, key)])));
  if (!parsed.success) return { error: "Completa el método/referencia del inicial, confirma el contrato firmado/documentado y el acta notarial definitiva firmada y usa una fecha de entrega válida." };
  if (isProvisionalActReference(parsed.data.signedDocumentPath)) return { error: "El ejemplo provisional del acta no puede registrarse como documento definitivo firmado." };

  let context;
  try { context = await loadHandoverContext(parsed.data.applicationId, access); }
  catch { return { error: "No se pudo verificar el expediente para la entrega. Intenta de nuevo." }; }
  if (!context || context.loan.id !== parsed.data.loanId) return { error: "La solicitud y el préstamo no están disponibles para esta entrega en tu sucursal." };
  const loan = context.loan;
  // Keep idempotent retries of active loans; require a complete server-read
  // profile for a new activation. A client flag cannot skip this check.
  const missing = missingHandoverFields(context.customer);
  if (loan.status === "approved" && missing.length) return { error: `Completa el expediente antes de entregar: ${missing.map((field) => field.label).join(", ")}.` };
  const paymentAccess = await getTenantAccess("payments.record");
  if (!paymentAccess.ok || paymentAccess.membership.tenant_id !== access.membership.tenant_id) {
    return { error: "Tu rol no puede registrar el pago inicial en esta sucursal." };
  }

  let evidence;
  try { evidence = await readPaymentEvidence(formData, parsed.data.paymentMethod); }
  catch (error) { return { error: error instanceof PaymentEvidenceError ? error.message : "No se pudo leer la evidencia del pago inicial." }; }
  const { data: paymentId, error } = await access.supabase.rpc("activate_approved_loan_with_evidence", {
    p_loan_id: parsed.data.loanId,
    p_payment_method: parsed.data.paymentMethod,
    p_reference: parsed.data.paymentReference || null,
    p_idempotency_key: parsed.data.idempotencyKey,
    p_signed_document_path: parsed.data.signedDocumentPath,
    p_contract_evidence_attested: parsed.data.contractEvidenceAttested === "on",
    p_delivery_date: parsed.data.deliveryDate,
    p_evidence_image: evidence.image,
    p_signed_receipt_attested: evidence.signedReceiptAttested,
  });
  if (error) {
    if (error.message.includes("CASH_ALREADY_CLOSED")) return { error: "Tu caja de iniciales ya está cerrada para hoy. Registra nuevas entregas en una jornada abierta." };
    if (error.message.includes("LOAN_NOT_APPROVED")) return { error: "El préstamo ya no está pendiente de formalización." };
    if (error.message.includes("IDEMPOTENCY_EVIDENCE_CONFLICT")) return { error: "Este pago ya tiene otra evidencia. Consulta su voucher antes de volver a intentarlo." };
    if (error.message.includes("FORBIDDEN")) return { error: "No tienes permiso para formalizar y registrar el inicial en esta sucursal." };
    if (error.message.includes("INVALID_ACTIVATION_EVIDENCE")) return { error: "Revisa la referencia, confirma el contrato firmado/documentado y la fecha de entrega." };
    return { error: "No se pudo completar la formalización. Verifica el préstamo y vuelve a intentarlo." };
  }

  if (typeof (loan as { customer_id?: unknown }).customer_id === "string") {
    try {
      const customerId = String((loan as { customer_id: string }).customer_id);
      await computeAndPersistCustomerEvaluation({
        supabase: access.supabase,
        tenantId: access.membership.tenant_id,
        customerId,
        userId: access.userId,
        triggerEvent: "loan_activated",
      });
      revalidatePath(`/clientes/${customerId}`);
    } catch {
      // Do not fail activation redirect if evaluation refresh fails.
    }
  }

  revalidatePath("/solicitudes");
  revalidatePath("/cobros");
  revalidatePath("/mdm");
  revalidatePath("/recibos");
  revalidatePath("/cajas");
  revalidatePath("/dispositivos");
  revalidatePath("/dispositivos/[id]", "page");
  revalidatePath("/");
  revalidatePath(`/solicitudes/${parsed.data.applicationId}/entrega`);
  revalidatePath(`/solicitudes/${parsed.data.applicationId}/acta`);
  redirect(typeof paymentId === "string" ? `/recibos/${paymentId}` : `/solicitudes/${parsed.data.applicationId}?estado=activada`);
}

