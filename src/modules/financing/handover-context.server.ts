import { z } from "zod";
import type { getTenantAccess } from "@/lib/security/tenant-access";

type Access = Extract<Awaited<ReturnType<typeof getTenantAccess>>, { ok: true }>;
export type HandoverQuote = {
  device?: { brand?: string; model?: string; imei?: string; serialNumber?: string; condition?: string };
  fixedInstallment?: string; installmentCount?: number; frequency?: string; totalCustomerPays?: string;
  baseInterest?: string; legalExpenses?: string; proposedAdjustment?: string;
  annualRatePercent?: string; termMonths?: number;
  firstInstallmentDate?: string; finalDueDate?: string; paymentDistribution?: string;
  schedule?: { sequence: number; dueDate: string; amount: string }[];
};

// Always reads through the caller's authenticated, tenant-scoped client.
// The approval event is the existing authoritative application -> loan link.
export async function loadHandoverContext(applicationId: string, access: Access) {
  if (!z.string().uuid().safeParse(applicationId).success) return null;
  const db = access.supabase;
  const tenantId = access.membership.tenant_id;
  const applicationResult = await db.from("credit_applications").select("id,customer_id,branch_id,status")
    .eq("tenant_id", tenantId).eq("id", applicationId).maybeSingle();
  if (applicationResult.error) throw new Error("HANDOVER_UNAVAILABLE");
  const application = applicationResult.data;
  if (!application || application.status !== "approved") return null;
  const eventsResult = await db.from("credit_application_events").select("metadata,created_at")
    .eq("tenant_id", tenantId).eq("application_id", applicationId).eq("to_status", "approved").order("created_at", { ascending: false });
  if (eventsResult.error) throw new Error("HANDOVER_UNAVAILABLE");
  const approval = eventsResult.data?.find((event) => typeof event.metadata?.loanId === "string");
  const loanId = approval?.metadata?.loanId;
  if (!z.string().uuid().safeParse(loanId).success) return null;
  const [loanResult, customerResult, companyResult] = await Promise.all([
    db.from("loans").select("id,customer_id,branch_id,contract_id,status,sale_price,down_payment,principal,delivered_at,activated_at")
      .eq("tenant_id", tenantId).eq("id", loanId).maybeSingle(),
    db.from("customers").select("id,branch_id,full_name,identity_number,phone,address,home_location,reference_name,reference_phone,reference_relationship")
      .eq("tenant_id", tenantId).eq("id", application.customer_id).maybeSingle(),
    db.from("tenants").select("name").eq("id", tenantId).maybeSingle(),
  ]);
  if (loanResult.error || customerResult.error || companyResult.error) throw new Error("HANDOVER_UNAVAILABLE");
  const loan = loanResult.data;
  const customer = customerResult.data;
  if (!loan || !customer || !companyResult.data || loan.customer_id !== customer.id || loan.branch_id !== application.branch_id || customer.branch_id !== application.branch_id) return null;
  const contractResult = await db.from("credit_contracts").select("id,contract_number,terms,document_path,signed_at,contract_evidence_attested")
    .eq("tenant_id", tenantId).eq("id", loan.contract_id).maybeSingle();
  if (contractResult.error) throw new Error("HANDOVER_UNAVAILABLE");
  if (!contractResult.data) return null;
  return { application, loan, customer, company: companyResult.data.name as string, contract: contractResult.data, quote: contractResult.data.terms as HandoverQuote };
}
