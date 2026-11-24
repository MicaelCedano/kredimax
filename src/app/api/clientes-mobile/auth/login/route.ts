import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  checkCustomerAuthRateLimit,
  maskCedula,
  normalizeDominicanCedula,
  resetCustomerAuthRateLimit,
  resolveCustomerPortalAuthEmail,
} from "@/lib/security/customer-portal-auth";

export const runtime = "nodejs";
const privateHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

const loginSchema = z.object({
  cedula: z.string().trim().min(11).max(20),
  password: z.string().min(6).max(256),
});

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    return NextResponse.json(
      { ok: false, code: "SERVICE_NOT_CONFIGURED", message: "El servicio móvil de KrediMax no está configurado." },
      { status: 503, headers: privateHeaders },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, code: "INVALID_PAYLOAD", message: "Solicitud de acceso inválida." },
      { status: 400, headers: privateHeaders },
    );
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, code: "INVALID_CREDENTIALS", message: "Verifica tu número de cédula y tu contraseña." },
      { status: 400, headers: privateHeaders },
    );
  }

  const digits = normalizeDominicanCedula(parsed.data.cedula);
  const authEmail = digits ? resolveCustomerPortalAuthEmail(digits) : null;
  if (!digits || !authEmail) {
    return NextResponse.json(
      { ok: false, code: "INVALID_CEDULA", message: "Ingresa un número de cédula dominicana válido de 11 dígitos." },
      { status: 400, headers: privateHeaders },
    );
  }

  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const rateKey = `login:${forwarded}:${digits.slice(-4)}`;
  const rateCheck = checkCustomerAuthRateLimit(rateKey, 5, 15 * 60 * 1000);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      {
        ok: false,
        code: "RATE_LIMITED",
        message: "Demasiados intentos de acceso. Espera unos minutos antes de volver a intentarlo.",
        retryAfterSeconds: rateCheck.retryAfterSeconds,
      },
      { status: 429, headers: privateHeaders },
    );
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.signInWithPassword({
    email: authEmail,
    password: parsed.data.password,
  });

  if (error || !data?.session || !data?.user) {
    // Never log or return the full cédula in error messages or logs
    return NextResponse.json(
      {
        ok: false,
        code: "INVALID_CREDENTIALS",
        message: "No pudimos validar tus credenciales. Revisa tu cédula y contraseña.",
      },
      { status: 401, headers: privateHeaders },
    );
  }

  resetCustomerAuthRateLimit(rateKey);

  const authedClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
  });

  const { data: portalAccount } = await authedClient
    .from("customer_portal_accounts")
    .select("id, status, must_change_password, locked_until")
    .eq("user_id", data.user.id)
    .maybeSingle();

  if (!portalAccount || portalAccount.status !== "active") {
    await authedClient.auth.signOut({ scope: "local" });
    return NextResponse.json(
      {
        ok: false,
        code: "ACCOUNT_INACTIVE",
        message: "Tu cuenta móvil aún no está activa o se encuentra suspendida. Contacta tu sucursal KrediMax.",
      },
      { status: 403, headers: privateHeaders },
    );
  }

  const mustChangePassword = Boolean(
    portalAccount.must_change_password || data.user.app_metadata?.kredimax_must_change_password,
  );

  return NextResponse.json(
    {
      ok: true,
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: data.session.expires_at ?? null,
      mustChangePassword,
      customer: {
        fullName: String(data.user.user_metadata?.full_name ?? "Cliente KrediMax"),
        maskedCedula: maskCedula(digits),
      },
    },
    { status: 200, headers: privateHeaders },
  );
}
