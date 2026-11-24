import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DEMO_PORTAL_SNAPSHOT, getDemoAuthorizedReceipt } from "../demo/demo-data";
import type {
  AuthorizedReceiptDocumentDto,
  CustomerLoanSummaryDto,
  CustomerPortalSnapshot,
  CustomerProfileDto,
  InstallmentItemDto,
  PaymentHistoryItemDto,
} from "../types/portal";
import { maskCedulaForDisplay, normalizeCedulaDigits } from "../utils/formatters";
import type { StoredPortalSession } from "./session-storage";

const API_BASE_URL = (process.env.EXPO_PUBLIC_KREDIMAX_API_URL ?? "").trim().replace(/\/+$/, "");
const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? "").trim();
const SUPABASE_PUBLISHABLE_KEY = (process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "").trim();

export function isBackendConnectedConfigured(): boolean {
  return Boolean(API_BASE_URL && SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
}

let cachedSupabaseClient: SupabaseClient | null = null;

export function getPublicSupabaseClient(): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) return null;
  if (!cachedSupabaseClient) {
    cachedSupabaseClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }
  return cachedSupabaseClient;
}

export interface LoginResult {
  ok: true;
  session: StoredPortalSession;
}

export interface ApiErrorResult {
  ok: false;
  code: string;
  message: string;
}

/**
 * Authenticates a customer against the KrediMax Next.js backend (`/api/clientes-mobile/auth/login`).
 * Never exposes full cédula in error messages or logs.
 */
export async function loginWithCedulaAndPassword(params: {
  cedula: string;
  password: string;
  allowDemoFallback?: boolean;
}): Promise<LoginResult | ApiErrorResult> {
  const digits = normalizeCedulaDigits(params.cedula);
  if (!digits) {
    return {
      ok: false,
      code: "INVALID_CEDULA",
      message: "Ingresa un número de cédula dominicana válido de 11 dígitos.",
    };
  }

  // If the backend is not configured and the user enters the demo credentials or demo fallback is enabled:
  if (!API_BASE_URL) {
    if (params.allowDemoFallback) {
      const isFirstTimeTempDemo = params.password === "TempKredi#2026";
      return {
        ok: true,
        session: {
          mode: "DEMO",
          accessToken: null,
          refreshToken: null,
          expiresAt: null,
          maskedCedula: maskCedulaForDisplay(digits),
          customerName: DEMO_PORTAL_SNAPSHOT.customer.fullName,
          mustChangePassword: isFirstTimeTempDemo,
        },
      };
    }
    return {
      ok: false,
      code: "API_NOT_CONFIGURED",
      message:
        "El servidor de producción aún no está configurado en este dispositivo. Usa el botón 'Entrar en Modo DEMO' para explorar la aplicación.",
    };
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/clientes-mobile/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        cedula: digits,
        password: params.password,
      }),
    });

    const payload = (await response.json().catch(() => null)) as
      | {
          ok?: boolean;
          code?: string;
          message?: string;
          session?: {
            accessToken: string;
            refreshToken: string;
            expiresAt: number | null;
          };
          customer?: {
            fullName: string;
            maskedCedula: string;
            mustChangePassword: boolean;
          };
        }
      | null;

    if (!response.ok || !payload?.ok || !payload.session || !payload.customer) {
      return {
        ok: false,
        code: payload?.code ?? "AUTH_FAILED",
        message:
          payload?.message ??
          "No fue posible iniciar sesión. Verifica tu cédula y contraseña.",
      };
    }

    return {
      ok: true,
      session: {
        mode: "CONNECTED",
        accessToken: payload.session.accessToken,
        refreshToken: payload.session.refreshToken,
        expiresAt: payload.session.expiresAt ?? null,
        maskedCedula: payload.customer.maskedCedula,
        customerName: payload.customer.fullName,
        mustChangePassword: Boolean(payload.customer.mustChangePassword),
      },
    };
  } catch {
    return {
      ok: false,
      code: "NETWORK_ERROR",
      message:
        "No se pudo conectar con KrediMax. Verifica tu conexión a internet o prueba el Modo DEMO.",
    };
  }
}

/**
 * Fetches the complete customer portal snapshot.
 * Strictly separates DEMO mode from CONNECTED mode so DEMO mode never mutates or queries real data.
 */
export async function fetchCustomerPortalSnapshot(
  session: StoredPortalSession,
): Promise<CustomerPortalSnapshot> {
  if (session.mode === "DEMO") {
    return {
      ...DEMO_PORTAL_SNAPSHOT,
      customer: {
        ...DEMO_PORTAL_SNAPSHOT.customer,
        maskedCedula: session.maskedCedula || DEMO_PORTAL_SNAPSHOT.customer.maskedCedula,
        mustChangePassword: session.mustChangePassword,
      },
    };
  }

  if (!API_BASE_URL || !session.accessToken) {
    throw new Error("SESSION_NOT_AUTHORIZED");
  }

  const headers = {
    Authorization: `Bearer ${session.accessToken}`,
    Accept: "application/json",
  };

  const [resumenRes, cuotasRes, pagosRes] = await Promise.all([
    fetch(`${API_BASE_URL}/api/clientes-mobile/resumen`, { headers }),
    fetch(`${API_BASE_URL}/api/clientes-mobile/cuotas`, { headers }),
    fetch(`${API_BASE_URL}/api/clientes-mobile/pagos`, { headers }),
  ]);

  if (resumenRes.status === 401 || cuotasRes.status === 401 || pagosRes.status === 401) {
    throw new Error("SESSION_EXPIRED");
  }

  if (!resumenRes.ok || !cuotasRes.ok || !pagosRes.ok) {
    throw new Error("PORTAL_SYNC_FAILED");
  }

  const [resumenJson, cuotasJson, pagosJson] = (await Promise.all([
    resumenRes.json(),
    cuotasRes.json(),
    pagosRes.json(),
  ])) as [
    { ok: boolean; customer: CustomerProfileDto; loans: CustomerLoanSummaryDto[] },
    { ok: boolean; installments: InstallmentItemDto[] },
    { ok: boolean; payments: PaymentHistoryItemDto[] },
  ];

  return {
    mode: "CONNECTED",
    customer: resumenJson.customer,
    loans: resumenJson.loans ?? [],
    installments: cuotasJson.installments ?? [],
    payments: pagosJson.payments ?? [],
  };
}

/**
 * Fetches an authorized payment receipt document.
 * Never fabricates receipts for unconfirmed or unauthorized payments.
 */
export async function fetchAuthorizedReceipt(
  session: StoredPortalSession,
  paymentId: string,
): Promise<AuthorizedReceiptDocumentDto> {
  if (session.mode === "DEMO") {
    const demoReceipt = getDemoAuthorizedReceipt(paymentId);
    if (!demoReceipt) {
      throw new Error("Este pago no dispone de un recibo autorizado.");
    }
    return demoReceipt;
  }

  if (!API_BASE_URL || !session.accessToken) {
    throw new Error("Sesión no válida para descargar el recibo.");
  }

  const response = await fetch(
    `${API_BASE_URL}/api/clientes-mobile/recibos/${encodeURIComponent(paymentId)}`,
    {
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        Accept: "application/json",
      },
    },
  );

  const payload = (await response.json().catch(() => null)) as
    | { ok?: boolean; message?: string; receipt?: AuthorizedReceiptDocumentDto }
    | null;

  if (!response.ok || !payload?.ok || !payload.receipt) {
    throw new Error(
      payload?.message ?? "El recibo solicitado no está disponible o no pertenece a tu cuenta.",
    );
  }

  return payload.receipt;
}

/**
 * Updates the customer's password on first login or from Profile.
 * In DEMO mode, simulates the password update locally without touching any server.
 */
export async function updateCustomerPassword(
  session: StoredPortalSession,
  params: { currentPassword?: string; newPassword: string },
): Promise<{ ok: true } | ApiErrorResult> {
  if (session.mode === "DEMO") {
    return { ok: true };
  }

  if (!API_BASE_URL || !session.accessToken) {
    return {
      ok: false,
      code: "UNAUTHENTICATED",
      message: "Tu sesión expiró. Inicia sesión nuevamente.",
    };
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/clientes-mobile/auth/change-password`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        currentPassword: params.currentPassword,
        newPassword: params.newPassword,
      }),
    });

    const payload = (await response.json().catch(() => null)) as
      | { ok?: boolean; code?: string; message?: string }
      | null;

    if (!response.ok || !payload?.ok) {
      return {
        ok: false,
        code: payload?.code ?? "PASSWORD_CHANGE_FAILED",
        message: payload?.message ?? "No se pudo actualizar tu contraseña.",
      };
    }

    return { ok: true };
  } catch {
    return {
      ok: false,
      code: "NETWORK_ERROR",
      message: "Error de conexión al intentar actualizar tu contraseña.",
    };
  }
}

/**
 * Requests access recovery for a customer's cédula.
 */
export async function requestPasswordRecovery(params: {
  cedula: string;
}): Promise<{ ok: true; message: string } | ApiErrorResult> {
  const digits = normalizeCedulaDigits(params.cedula);
  if (!digits) {
    return {
      ok: false,
      code: "INVALID_CEDULA",
      message: "Ingresa un número de cédula válido de 11 dígitos.",
    };
  }

  if (!API_BASE_URL) {
    return {
      ok: true,
      message:
        "En Modo DEMO: Solicita una clave temporal aleatoria a tu oficial de crédito en sucursal o ingresa directamente con el botón Modo DEMO.",
    };
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/clientes-mobile/auth/recover`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ cedula: digits }),
    });

    const payload = (await response.json().catch(() => null)) as
      | { ok?: boolean; code?: string; message?: string }
      | null;

    if (!response.ok || !payload?.ok) {
      return {
        ok: false,
        code: payload?.code ?? "RECOVERY_FAILED",
        message: payload?.message ?? "No se pudo procesar la solicitud en este momento.",
      };
    }

    return {
      ok: true,
      message:
        payload.message ??
        "Si tu cédula tiene un financiamiento activo, recibirás asistencia para restablecer tu clave temporal.",
    };
  } catch {
    return {
      ok: false,
      code: "NETWORK_ERROR",
      message: "No fue posible conectar con el servidor. Intenta nuevamente.",
    };
  }
}
