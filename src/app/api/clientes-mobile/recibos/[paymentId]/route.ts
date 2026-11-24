import { NextResponse } from "next/server";
import { formatDop } from "@/lib/format-money";
import {
  getAuthenticatedCustomerPortalContext,
  maskCedula,
} from "@/lib/security/customer-portal-auth";

export const runtime = "nodejs";
const privateHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ paymentId: string }> },
) {
  const { paymentId } = await params;
  if (!UUID_REGEX.test(paymentId)) {
    return NextResponse.json(
      { ok: false, code: "INVALID_RECEIPT_ID", message: "Identificador de recibo no válido." },
      { status: 404, headers: privateHeaders },
    );
  }

  const auth = await getAuthenticatedCustomerPortalContext(request);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, code: auth.code, message: auth.message },
      { status: auth.status, headers: privateHeaders },
    );
  }

  const { supabase, portalAccount } = auth.context;
  const tenantId = portalAccount.tenant_id;
  const customerId = portalAccount.customer_id;

  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    .select(
      "id, receipt_number, loan_id, amount, currency, received_at, payment_method, reference, payment_type, reversed_at",
    )
    .eq("tenant_id", tenantId)
    .eq("id", paymentId)
    .maybeSingle();

  if (paymentError) {
    return NextResponse.json(
      { ok: false, code: "RECEIPT_QUERY_FAILED", message: "No se pudo consultar el comprobante." },
      { status: 503, headers: privateHeaders },
    );
  }

  if (!payment) {
    return NextResponse.json(
      { ok: false, code: "RECEIPT_NOT_FOUND", message: "El comprobante solicitado no existe o no pertenece a tu cuenta." },
      { status: 404, headers: privateHeaders },
    );
  }

  // Strictly enforce loan ownership against the authenticated customer_id
  const { data: loan, error: loanError } = await supabase
    .from("loans")
    .select("id, customer_id, contract_id, device_id")
    .eq("tenant_id", tenantId)
    .eq("id", payment.loan_id)
    .maybeSingle();

  if (loanError || !loan || loan.customer_id !== customerId) {
    return NextResponse.json(
      { ok: false, code: "FORBIDDEN_RECEIPT", message: "No tienes autorización para consultar este recibo." },
      { status: 403, headers: privateHeaders },
    );
  }

  if (payment.reversed_at) {
    return NextResponse.json(
      {
        ok: false,
        code: "RECEIPT_REVERSED",
        message: "Este movimiento fue reversado y no constituye un comprobante de pago vigente.",
      },
      { status: 409, headers: privateHeaders },
    );
  }

  const [customerRes, contractRes, deviceRes, allocationsRes] = await Promise.all([
    supabase
      .from("customers")
      .select("full_name, identity_number")
      .eq("tenant_id", tenantId)
      .eq("id", customerId)
      .maybeSingle(),
    supabase
      .from("credit_contracts")
      .select("contract_number")
      .eq("tenant_id", tenantId)
      .eq("id", loan.contract_id)
      .maybeSingle(),
    supabase
      .from("devices")
      .select("brand, model")
      .eq("tenant_id", tenantId)
      .eq("id", loan.device_id)
      .maybeSingle(),
    supabase
      .from("payment_allocations")
      .select("installment_id, amount")
      .eq("tenant_id", tenantId)
      .eq("payment_id", payment.id),
  ]);

  if (customerRes.error || contractRes.error || deviceRes.error || allocationsRes.error || !customerRes.data || !contractRes.data) {
    return NextResponse.json(
      { ok: false, code: "RECEIPT_DETAILS_UNAVAILABLE", message: "No se pudo completar el detalle del comprobante." },
      { status: 503, headers: privateHeaders },
    );
  }

  const installmentIds = (allocationsRes.data ?? []).map((a) => a.installment_id);
  const installmentsRes = installmentIds.length
    ? await supabase
        .from("installments")
        .select("id, sequence, due_date")
        .eq("tenant_id", tenantId)
        .in("id", installmentIds)
    : { data: [], error: null };

  const instMap = new Map((installmentsRes.data ?? []).map((i) => [i.id, i]));

  return NextResponse.json(
    {
      ok: true,
      receipt: {
        id: payment.id,
        receiptNumber: payment.receipt_number ?? `REC-${payment.id.slice(0, 8).toUpperCase()}`,
        contractNumber: contractRes.data.contract_number,
        customerName: customerRes.data.full_name,
        maskedCedula: maskCedula(customerRes.data.identity_number ?? portalAccount.identity_key),
        deviceName: [deviceRes.data?.brand, deviceRes.data?.model].filter(Boolean).join(" ") || "Equipo financiado",
        amount: String(payment.amount),
        amountFormatted: formatDop(payment.amount),
        currency: payment.currency ?? "DOP",
        receivedAt: payment.received_at,
        paymentMethod: payment.payment_method,
        paymentType: payment.payment_type,
        reference: payment.reference ?? "Sin referencia adicional",
        allocations: (allocationsRes.data ?? []).map((a) => {
          const inst = instMap.get(a.installment_id);
          return {
            sequence: inst?.sequence ?? null,
            dueDate: inst?.due_date ?? null,
            amount: String(a.amount),
            amountFormatted: formatDop(a.amount),
          };
        }),
      },
    },
    { status: 200, headers: privateHeaders },
  );
}
