import { NextResponse } from "next/server";
import {
  getAuthenticatedCustomerPortalContext,
  loadCustomerFinancialSnapshot,
} from "@/lib/security/customer-portal-auth";

export const runtime = "nodejs";
const privateHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(request: Request) {
  const auth = await getAuthenticatedCustomerPortalContext(request);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, code: auth.code, message: auth.message },
      { status: auth.status, headers: privateHeaders },
    );
  }

  try {
    const snapshot = await loadCustomerFinancialSnapshot(auth.context);
    const url = new URL(request.url);
    const loanId = url.searchParams.get("loanId");

    if (loanId && !snapshot.loans.some((l) => l.id === loanId)) {
      return NextResponse.json(
        { ok: false, code: "LOAN_FORBIDDEN_OR_NOT_FOUND", message: "No tienes acceso a este financiamiento." },
        { status: 403, headers: privateHeaders },
      );
    }

    const payments = loanId
      ? snapshot.payments.filter((p) => p.loanId === loanId)
      : snapshot.payments;

    return NextResponse.json(
      {
        ok: true,
        payments,
      },
      { status: 200, headers: privateHeaders },
    );
  } catch {
    return NextResponse.json(
      { ok: false, code: "PAYMENTS_UNAVAILABLE", message: "No se pudo consultar el historial de pagos." },
      { status: 503, headers: privateHeaders },
    );
  }
}
