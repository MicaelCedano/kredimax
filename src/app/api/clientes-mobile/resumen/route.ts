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
    const requestedLoanId = url.searchParams.get("loanId");
    const selectedLoan =
      (requestedLoanId ? snapshot.loans.find((l) => l.id === requestedLoanId) : null) ??
      snapshot.loans[0] ??
      null;

    return NextResponse.json(
      {
        ok: true,
        customer: snapshot.customer,
        selectedLoan,
        loans: snapshot.loans,
      },
      { status: 200, headers: privateHeaders },
    );
  } catch {
    return NextResponse.json(
      { ok: false, code: "SUMMARY_UNAVAILABLE", message: "No se pudo consultar el resumen financiero." },
      { status: 503, headers: privateHeaders },
    );
  }
}
