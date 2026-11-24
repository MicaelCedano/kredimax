import { NextResponse } from "next/server";
import { z } from "zod";
import {
  checkCustomerAuthRateLimit,
  normalizeDominicanCedula,
} from "@/lib/security/customer-portal-auth";

export const runtime = "nodejs";
const privateHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

const recoverSchema = z.object({
  cedula: z.string().trim().min(11).max(20),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, code: "INVALID_PAYLOAD", message: "Solicitud inválida." },
      { status: 400, headers: privateHeaders },
    );
  }

  const parsed = recoverSchema.safeParse(body);
  const digits = parsed.success ? normalizeDominicanCedula(parsed.data.cedula) : null;
  if (!digits) {
    return NextResponse.json(
      { ok: false, code: "INVALID_CEDULA", message: "Ingresa un número de cédula dominicana válido de 11 dígitos." },
      { status: 400, headers: privateHeaders },
    );
  }

  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const rateKey = `recover:${forwarded}:${digits.slice(-4)}`;
  const rateCheck = checkCustomerAuthRateLimit(rateKey, 3, 15 * 60 * 1000);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      {
        ok: false,
        code: "RATE_LIMITED",
        message: "Ya recibimos tu solicitud recientemente. Espera unos minutos antes de reintentar.",
        retryAfterSeconds: rateCheck.retryAfterSeconds,
      },
      { status: 429, headers: privateHeaders },
    );
  }

  // Constant-response anti-enumeration message; never reveals whether a cédula exists or exposes full identity numbers.
  return NextResponse.json(
    {
      ok: true,
      message:
        "Por seguridad financiera, el restablecimiento de acceso se valida con tu oficial de cuenta o sucursal KrediMax. Presenta tu documento de identidad o comunícate al centro de soporte para recibir una clave temporal aleatoria.",
    },
    { status: 200, headers: privateHeaders },
  );
}
