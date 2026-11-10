"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getTenantAccess } from "@/lib/security/tenant-access";
import { parseMoneyToCents } from "@/modules/financing/calculator";
import { computeAndPersistCustomerEvaluation } from "@/modules/credit-evaluation/service";
import { PaymentEvidenceError, readPaymentEvidence } from "@/modules/payments/evidence";

const schema = z.object({
  loanId: z.string().uuid(),
  amount: z.string().regex(/^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/),
  idempotencyKey: z.string().uuid(),
  paymentMethod: z.enum(["cash", "bank_transfer", "card", "other"]),
  reference: z.string().trim().max(120),
});

export type PaymentActionState = { state: string } | null;

export async function recordLoanPayment(_previousState: PaymentActionState, formData: FormData): Promise<PaymentActionState> {
  const access = await getTenantAccess("payments.record");
  if (!access.ok) {
    if (access.reason === "unauthenticated") redirect("/login");
    return { state: "forbidden" };
  }
  const parsed = schema.safeParse({
    loanId: String(formData.get("loanId") ?? ""),
    amount: String(formData.get("amount") ?? ""),
    idempotencyKey: String(formData.get("idempotencyKey") ?? ""),
    paymentMethod: String(formData.get("paymentMethod") ?? ""),
    reference: String(formData.get("reference") ?? ""),
  });
  if (!parsed.success) return { state: "invalid" };
  let validAmount = false;
  try {
    const cents = parseMoneyToCents(parsed.data.amount);
    validAmount = cents > 0n && cents <= 99_999_999_900n;
  } catch { validAmount = false; }
  if (!validAmount) return { state: "invalid" };
  let evidence;
  try { evidence = await readPaymentEvidence(formData, parsed.data.paymentMethod); }
  catch (error) { return { state: error instanceof PaymentEvidenceError ? error.code : "evidence-invalid" }; }
  const { data: paymentId, error } = await access.supabase.rpc("record_loan_payment_with_evidence", {
    p_loan_id: parsed.data.loanId,
    p_amount: parsed.data.amount,
    p_idempotency_key: parsed.data.idempotencyKey,
    p_payment_method: parsed.data.paymentMethod,
    p_reference: parsed.data.reference || null,
    p_evidence_image: evidence.image,
    p_signed_receipt_attested: evidence.signedReceiptAttested,
  });
  if (error) {
    const state = error.message.includes("CASH_ALREADY_CLOSED") ? "cash-closed" : error.message.includes("EXCEEDS_BALANCE") ? "exceeds-balance" : error.message.includes("IDEMPOTENCY_EVIDENCE_CONFLICT") ? "evidence-conflict" : "save-error";
    return { state };
  }

  try {
    const { data: loan } = await access.supabase
      .from("loans")
      .select("customer_id")
      .eq("tenant_id", access.membership.tenant_id)
      .eq("id", parsed.data.loanId)
      .maybeSingle();
    if (loan?.customer_id) {
      await computeAndPersistCustomerEvaluation({
        supabase: access.supabase,
        tenantId: access.membership.tenant_id,
        customerId: loan.customer_id,
        userId: access.userId,
        triggerEvent: "payment_recorded",
      });
      revalidatePath(`/clientes/${loan.customer_id}`);
    }
  } catch {
    // Keep payment confirmation resilient if optional evaluation refresh fails.
  }

  revalidatePath("/cobros");
  revalidatePath("/mdm");
  revalidatePath("/recibos");
  revalidatePath("/cajas");
  revalidatePath("/reportes");
  revalidatePath("/financiamientos");
  redirect(typeof paymentId === "string" ? `/recibos/${paymentId}` : "/cobros?estado=registrado");
}

const reversalSchema = z.object({ paymentId: z.string().uuid(), reason: z.string().trim().min(5).max(500) });

export async function reverseLoanPayment(_previousState: PaymentActionState, formData: FormData): Promise<PaymentActionState> {
  const access = await getTenantAccess("payments.reverse");
  if (!access.ok) {
    if (access.reason === "unauthenticated") redirect("/login");
    return { state: "forbidden" };
  }
  const parsed = reversalSchema.safeParse({ paymentId: String(formData.get("paymentId") ?? ""), reason: String(formData.get("reason") ?? "") });
  if (!parsed.success) return { state: "reversal-invalid" };
  const { error } = await access.supabase.rpc("reverse_loan_payment", { p_payment_id: parsed.data.paymentId, p_reason: parsed.data.reason });
  if (error) return { state: error.message.includes("CASH_ALREADY_CLOSED") ? "cash-closed" : error.message.includes("FORBIDDEN") ? "forbidden" : "reversal-error" };

  try {
    const { data: payment } = await access.supabase
      .from("payments")
      .select("loan_id")
      .eq("tenant_id", access.membership.tenant_id)
      .eq("id", parsed.data.paymentId)
      .maybeSingle();
    if (payment?.loan_id) {
      const { data: loan } = await access.supabase
        .from("loans")
        .select("customer_id")
        .eq("tenant_id", access.membership.tenant_id)
        .eq("id", payment.loan_id)
        .maybeSingle();
      if (loan?.customer_id) {
        await computeAndPersistCustomerEvaluation({
          supabase: access.supabase,
          tenantId: access.membership.tenant_id,
          customerId: loan.customer_id,
          userId: access.userId,
          triggerEvent: "payment_reversed",
        });
        revalidatePath(`/clientes/${loan.customer_id}`);
      }
    }
  } catch {
    // Keep payment reversal resilient if optional evaluation refresh fails.
  }

  for (const path of ["/cobros", "/recibos", "/cajas", "/reportes", "/financiamientos", "/auditoria", "/mdm"]) revalidatePath(path);
  redirect("/cobros?estado=revertido");
}
