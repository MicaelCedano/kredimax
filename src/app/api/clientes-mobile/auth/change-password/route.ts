import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createSupabaseAdminClient, isUserProvisioningConfigured } from "@/lib/supabase/admin";
import {
  checkCustomerAuthRateLimit,
  getAuthenticatedCustomerPortalContext,
  resolveCustomerPortalAuthEmail,
  validateCustomerPasswordPolicy,
} from "@/lib/security/customer-portal-auth";

export const runtime = "nodejs";
const privateHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(6).max(256),
    newPassword: z.string().min(10).max(128),
    confirmPassword: z.string().min(10).max(128),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "La confirmación de contraseña no coincide.",
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: "La nueva contraseña debe ser diferente a la actual.",
  });

export async function POST(request: Request) {
  const auth = await getAuthenticatedCustomerPortalContext(request);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, code: auth.code, message: auth.message },
      { status: auth.status, headers: privateHeaders },
    );
  }

  const rateKey = `pwd:${auth.context.userId}`;
  const rateCheck = checkCustomerAuthRateLimit(rateKey, 5, 15 * 60 * 1000);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      {
        ok: false,
        code: "RATE_LIMITED",
        message: "Demasiados intentos de cambio de contraseña. Inténtalo de nuevo más tarde.",
        retryAfterSeconds: rateCheck.retryAfterSeconds,
      },
      { status: 429, headers: privateHeaders },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, code: "INVALID_PAYLOAD", message: "Datos inválidos." },
      { status: 400, headers: privateHeaders },
    );
  }

  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        code: "VALIDATION_ERROR",
        message: parsed.error.issues[0]?.message ?? "Revisa los requisitos de la nueva contraseña.",
      },
      { status: 400, headers: privateHeaders },
    );
  }

  const policy = validateCustomerPasswordPolicy(
    parsed.data.newPassword,
    auth.context.portalAccount.identity_key,
  );
  if (!policy.valid) {
    return NextResponse.json(
      { ok: false, code: "WEAK_OR_FORBIDDEN_PASSWORD", message: policy.reason },
      { status: 400, headers: privateHeaders },
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const authEmail = resolveCustomerPortalAuthEmail(auth.context.portalAccount.identity_key);
  if (!url || !key || !authEmail) {
    return NextResponse.json(
      { ok: false, code: "SERVICE_NOT_CONFIGURED", message: "Configuración de autenticación incompleta." },
      { status: 503, headers: privateHeaders },
    );
  }

  const verifier = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const verified = await verifier.auth.signInWithPassword({
      email: authEmail,
      password: parsed.data.currentPassword,
    });
    if (verified.error || verified.data.user?.id !== auth.context.userId) {
      return NextResponse.json(
        { ok: false, code: "CURRENT_PASSWORD_INVALID", message: "La contraseña actual ingresada no es correcta." },
        { status: 401, headers: privateHeaders },
      );
    }

    const updated = await verifier.auth.updateUser({
      password: parsed.data.newPassword,
    });
    if (updated.error) {
      return NextResponse.json(
        { ok: false, code: "PASSWORD_UPDATE_FAILED", message: "No se pudo actualizar tu contraseña. Intenta nuevamente." },
        { status: 503, headers: privateHeaders },
      );
    }
  } finally {
    await verifier.auth.signOut({ scope: "local" });
  }

  if (isUserProvisioningConfigured()) {
    try {
      const admin = createSupabaseAdminClient();
      const nowIso = new Date().toISOString();
      await Promise.all([
        admin
          .from("customer_portal_accounts")
          .update({
            must_change_password: false,
            password_changed_at: nowIso,
            updated_at: nowIso,
          })
          .eq("id", auth.context.portalAccount.id)
          .eq("tenant_id", auth.context.portalAccount.tenant_id),
        admin.auth.admin.updateUserById(auth.context.userId, {
          app_metadata: {
            kredimax_account_type: "customer_portal",
            kredimax_tenant_id: auth.context.portalAccount.tenant_id,
            kredimax_customer_id: auth.context.portalAccount.customer_id,
            kredimax_must_change_password: false,
          },
        }),
      ]);
    } catch {
      // Do not fail response if optional metadata sync encounters transient error
    }
  }

  return NextResponse.json(
    {
      ok: true,
      mustChangePassword: false,
      message: "Tu contraseña se actualizó correctamente.",
    },
    { status: 200, headers: privateHeaders },
  );
}
