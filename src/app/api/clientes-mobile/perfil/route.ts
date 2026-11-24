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
    return NextResponse.json(
      {
        ok: true,
        profile: snapshot.customer,
      },
      { status: 200, headers: privateHeaders },
    );
  } catch {
    return NextResponse.json(
      { ok: false, code: "PROFILE_UNAVAILABLE", message: "No se pudo cargar tu perfil en este momento." },
      { status: 503, headers: privateHeaders },
    );
  }
}
