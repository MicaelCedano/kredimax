import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient, isUserProvisioningConfigured } from "@/lib/supabase/admin";
import { decimalToCents, formatDop, formatDopCents } from "@/lib/format-money";
import { isoDateInTimeZone } from "@/lib/business-date";

const SAFE_TEMP_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*";

/**
 * Normalizes a Dominican identity number (cédula) to 11 digits.
 * Returns null if the input does not contain exactly 11 numeric digits.
 */
export function normalizeDominicanCedula(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!/^\d{11}$/.test(digits) || /^0+$/.test(digits)) return null;
  return digits;
}

/**
 * Formats an 11-digit cédula with standard dashes (000-0000000-0).
 */
export function formatCedulaDashes(raw: string): string {
  const digits = normalizeDominicanCedula(raw);
  if (!digits) return "***-*******-*";
  return `${digits.slice(0, 3)}-${digits.slice(3, 10)}-${digits.slice(10)}`;
}

/**
 * Partially masks a cédula so full identity numbers are NEVER exposed in logs,
 * analytics, error messages, or profile headers (e.g. "***-****123-4").
 */
export function maskCedula(raw: string | null | undefined): string {
  const digits = normalizeDominicanCedula(raw);
  if (!digits) return "***-*******-*";
  return `***-****${digits.slice(7, 10)}-${digits.slice(10)}`;
}

/**
 * Deterministically maps a normalized 11-digit cédula to the internal Supabase Auth
 * email representation for customer portal accounts.
 */
export function resolveCustomerPortalAuthEmail(cedula: string): string | null {
  const digits = normalizeDominicanCedula(cedula);
  if (!digits) return null;
  return `cedula.${digits}@clientes.kredimax.local`;
}

/**
 * Validates that a password is strong and NEVER contains the last 4 digits of the cédula
 * or the full cédula digits.
 */
export function validateCustomerPasswordPolicy(
  password: string,
  cedula?: string | null,
): { valid: true } | { valid: false; reason: string } {
  if (!password || password.length < 10 || password.length > 128) {
    return {
      valid: false,
      reason: "La contraseña debe tener entre 10 y 128 caracteres.",
    };
  }
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
    return {
      valid: false,
      reason: "La contraseña debe incluir mayúsculas, minúsculas y números.",
    };
  }
  const digits = normalizeDominicanCedula(cedula);
  if (digits) {
    const lastFour = digits.slice(-4);
    if (password.includes(lastFour) || password.includes(digits) || password === lastFour) {
      return {
        valid: false,
        reason: "Por seguridad, la contraseña nunca puede contener los últimos 4 dígitos ni la secuencia de tu cédula.",
      };
    }
    for (let i = 0; i <= digits.length - 4; i += 1) {
      const sub = digits.slice(i, i + 4);
      if (password.includes(sub)) {
        return {
          valid: false,
          reason: "Por seguridad, la contraseña no puede derivarse de tu número de cédula.",
        };
      }
    }
  }
  return { valid: true };
}

/**
 * Generates a cryptographically random temporary password (14 characters)
 * that is guaranteed NOT to contain any 4-digit substring of the customer's cédula.
 */
export function generateTemporaryCustomerPassword(cedula?: string | null): string {
  const digits = normalizeDominicanCedula(cedula);
  const forbiddenSubstrings: string[] = [];
  if (digits) {
    forbiddenSubstrings.push(digits.slice(-4), digits.slice(0, 4), digits.slice(3, 7));
  }

  for (let attempt = 0; attempt < 25; attempt += 1) {
    const bytes = randomBytes(16);
    const chars: string[] = ["K", "m", "!", "9"];
    for (let i = 0; i < 10; i += 1) {
      chars.push(SAFE_TEMP_CHARS[bytes[i] % SAFE_TEMP_CHARS.length]);
    }
    // Fisher-Yates shuffle using remaining random bytes
    for (let i = chars.length - 1; i > 0; i -= 1) {
      const j = bytes[i % bytes.length] % (i + 1);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    const candidate = chars.join("");
    const hasForbidden = forbiddenSubstrings.some((sub) => sub && candidate.includes(sub));
    const policy = validateCustomerPasswordPolicy(candidate, digits);
    if (!hasForbidden && policy.valid) {
      return candidate;
    }
  }
  throw new Error("TEMP_PASSWORD_GENERATION_FAILED");
}

// In-memory rate limiter for customer authentication and password recovery endpoints.
const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

export function checkCustomerAuthRateLimit(
  bucketKey: string,
  maxAttempts = 5,
  windowMs = 15 * 60 * 1000,
): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const existing = rateLimitBuckets.get(bucketKey);
  if (!existing || existing.resetAt <= now) {
    rateLimitBuckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (existing.count >= maxAttempts) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }
  existing.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

export function resetCustomerAuthRateLimit(bucketKey: string) {
  rateLimitBuckets.delete(bucketKey);
}

export type CustomerPortalContext = {
  supabase: SupabaseClient;
  userId: string;
  email: string | null;
  portalAccount: {
    id: string;
    tenant_id: string;
    branch_id: string | null;
    customer_id: string;
    identity_key: string;
    status: string;
    must_change_password: boolean;
    password_changed_at: string | null;
    last_login_at: string | null;
    executive_name?: string | null;
    executive_whatsapp?: string | null;
  };
};

/**
 * Resolves the authenticated customer from a Bearer token (React Native mobile client)
 * or server cookies. Never trusts a customer_id passed in query or body parameters.
 */
export async function getAuthenticatedCustomerPortalContext(
  request: Request,
): Promise<
  | { ok: true; context: CustomerPortalContext }
  | { ok: false; status: 401 | 403 | 503; code: string; message: string }
> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    return {
      ok: false,
      status: 503,
      code: "SERVICE_NOT_CONFIGURED",
      message: "El servicio de clientes no está configurado en este entorno.",
    };
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const bearerToken = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : null;

  let supabase: SupabaseClient;
  try {
    if (bearerToken) {
      supabase = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${bearerToken}` } },
      });
    } else {
      supabase = await createSupabaseServerClient();
    }
  } catch {
    return {
      ok: false,
      status: 503,
      code: "AUTH_CLIENT_UNAVAILABLE",
      message: "No se pudo verificar la sesión en este momento.",
    };
  }

  const { data: userData, error: userError } = bearerToken
    ? await supabase.auth.getUser(bearerToken)
    : await supabase.auth.getUser();

  if (userError || !userData?.user?.id) {
    return {
      ok: false,
      status: 401,
      code: "UNAUTHENTICATED",
      message: "Tu sesión expiró o no es válida. Inicia sesión nuevamente.",
    };
  }

  const user = userData.user;
  const { data: portalAccount, error: accountError } = await supabase
    .from("customer_portal_accounts")
    .select(
      "id, tenant_id, branch_id, customer_id, identity_key, status, must_change_password, password_changed_at, last_login_at, locked_until, executive_name, executive_whatsapp",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (accountError) {
    return {
      ok: false,
      status: 503,
      code: "ACCOUNT_LOOKUP_FAILED",
      message: "No se pudo consultar tu cuenta de cliente.",
    };
  }

  if (!portalAccount) {
    return {
      ok: false,
      status: 403,
      code: "NOT_CUSTOMER_ACCOUNT",
      message: "Esta cuenta no tiene un expediente de cliente vinculado.",
    };
  }

  if (
    portalAccount.status !== "active" ||
    (portalAccount.locked_until && new Date(portalAccount.locked_until).getTime() > Date.now())
  ) {
    return {
      ok: false,
      status: 403,
      code: "ACCOUNT_SUSPENDED_OR_LOCKED",
      message: "Tu acceso móvil está temporalmente restringido. Comunícate con tu sucursal KrediMax.",
    };
  }

  const mustChangeMeta = Boolean(user.app_metadata?.kredimax_must_change_password);

  return {
    ok: true,
    context: {
      supabase,
      userId: user.id,
      email: user.email && !user.email.endsWith(".kredimax.local") ? user.email : null,
      portalAccount: {
        id: portalAccount.id,
        tenant_id: portalAccount.tenant_id,
        branch_id: portalAccount.branch_id,
        customer_id: portalAccount.customer_id,
        identity_key: portalAccount.identity_key,
        status: portalAccount.status,
        must_change_password: Boolean(portalAccount.must_change_password || mustChangeMeta),
        password_changed_at: portalAccount.password_changed_at,
        last_login_at: portalAccount.last_login_at,
        executive_name: (portalAccount as { executive_name?: string | null }).executive_name ?? null,
        executive_whatsapp: (portalAccount as { executive_whatsapp?: string | null }).executive_whatsapp ?? null,
      },
    },
  };
}

export type CustomerLoanSummaryDto = {
  id: string;
  contractId: string;
  contractNumber: string;
  contractSignedAt: string | null;
  status: string;
  statusLabel: string;
  device: {
    id: string;
    brand: string;
    model: string;
    imeiMasked: string;
    imageCategory: "samsung" | "iphone" | "xiaomi" | "generic";
  };
  salePrice: string;
  salePriceFormatted: string;
  downPayment: string;
  downPaymentFormatted: string;
  principal: string;
  principalFormatted: string;
  totalFinanced: string;
  totalFinancedFormatted: string;
  totalPaid: string;
  totalPaidFormatted: string;
  pendingBalance: string;
  pendingBalanceFormatted: string;
  progressPercent: number;
  installmentCount: number;
  paidInstallmentsCount: number;
  nextInstallment: {
    sequence: number;
    dueDate: string;
    amountDue: string;
    amountDueFormatted: string;
    balance: string;
    balanceFormatted: string;
    status: string;
  } | null;
  deliveredAt: string | null;
  createdAt: string;
};

const LOAN_STATUS_LABELS: Record<string, string> = {
  draft: "Borrador",
  pending: "En revisión",
  approved: "Aprobado",
  active: "Activo · Al día",
  paid_off: "Saldado",
  rejected: "No aprobado",
  cancelled: "Cancelado",
};

function resolveDeviceImageCategory(brand: string): "samsung" | "iphone" | "xiaomi" | "generic" {
  const lower = brand.toLowerCase();
  if (lower.includes("samsung") || lower.includes("galaxy")) return "samsung";
  if (lower.includes("apple") || lower.includes("iphone")) return "iphone";
  if (lower.includes("xiaomi") || lower.includes("redmi") || lower.includes("poco")) return "xiaomi";
  return "generic";
}

function maskImei(imei: string | null | undefined): string {
  if (!imei) return "No registrado";
  const clean = imei.replace(/\D/g, "");
  if (clean.length < 6) return "•••••••••••••••";
  return `•••••••••••${clean.slice(-4)}`;
}

/**
 * Loads the complete financial state for the authenticated customer directly from
 * authoritative database records (loans, credit_contracts, devices, installments, payments).
 * Reuses `decimalToCents` / `formatDopCents` from `@/lib/format-money` so calculations
 * never diverge from the administrative platform.
 */
export async function loadCustomerFinancialSnapshot(ctx: CustomerPortalContext) {
  const { supabase, portalAccount } = ctx;
  const tenantId = portalAccount.tenant_id;
  const customerId = portalAccount.customer_id;

  const [customerRes, tenantRes, branchRes, loansRes] = await Promise.all([
    supabase
      .from("customers")
      .select("id, full_name, identity_number, phone, address, created_at, created_by_name")
      .eq("tenant_id", tenantId)
      .eq("id", customerId)
      .maybeSingle(),
    supabase.from("tenants").select("name, legal_name, currency, timezone").eq("id", tenantId).maybeSingle(),
    portalAccount.branch_id
      ? supabase.from("branches").select("name, code").eq("tenant_id", tenantId).eq("id", portalAccount.branch_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("loans")
      .select("id, contract_id, device_id, status, sale_price, down_payment, principal, installment_count, delivered_at, activated_at, created_at")
      .eq("tenant_id", tenantId)
      .eq("customer_id", customerId)
      .in("status", ["active", "paid_off", "approved"])
      .order("created_at", { ascending: false }),
  ]);

  if (customerRes.error || !customerRes.data || loansRes.error) {
    throw new Error("SNAPSHOT_LOAD_FAILED");
  }

  const loans = loansRes.data ?? [];
  const loanIds = loans.map((l) => l.id);
  const contractIds = loans.map((l) => l.contract_id);
  const deviceIds = loans.map((l) => l.device_id);

  const [contractsRes, devicesRes, installmentsRes, paymentsRes] = await Promise.all([
    contractIds.length
      ? supabase.from("credit_contracts").select("id, contract_number, signed_at, terms").eq("tenant_id", tenantId).in("id", contractIds)
      : Promise.resolve({ data: [], error: null }),
    deviceIds.length
      ? supabase.from("devices").select("id, brand, model, imei").eq("tenant_id", tenantId).in("id", deviceIds)
      : Promise.resolve({ data: [], error: null }),
    loanIds.length
      ? supabase
          .from("installments")
          .select("id, loan_id, sequence, due_date, amount_due, amount_paid, status")
          .eq("tenant_id", tenantId)
          .in("loan_id", loanIds)
          .order("sequence", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    loanIds.length
      ? supabase
          .from("payments")
          .select("id, receipt_number, loan_id, amount, currency, received_at, payment_method, reference, payment_type, reversed_at")
          .eq("tenant_id", tenantId)
          .in("loan_id", loanIds)
          .order("received_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (contractsRes.error || devicesRes.error || installmentsRes.error || paymentsRes.error) {
    throw new Error("SNAPSHOT_RELATIONS_FAILED");
  }

  const contractsById = new Map((contractsRes.data ?? []).map((c) => [c.id, c]));
  const devicesById = new Map((devicesRes.data ?? []).map((d) => [d.id, d]));
  const todayIso = isoDateInTimeZone(new Date());

  const installmentsByLoan = new Map<string, typeof installmentsRes.data>();
  for (const inst of installmentsRes.data ?? []) {
    const list = installmentsByLoan.get(inst.loan_id) ?? [];
    list.push(inst);
    installmentsByLoan.set(inst.loan_id, list);
  }

  const loanSummaries: CustomerLoanSummaryDto[] = loans.map((loan) => {
    const contract = contractsById.get(loan.contract_id);
    const device = devicesById.get(loan.device_id);
    const loanInstallments = installmentsByLoan.get(loan.id) ?? [];

    const totalScheduledCents = loanInstallments.reduce(
      (sum, row) => sum + (row.status === "waived" ? 0n : decimalToCents(row.amount_due)),
      0n,
    );
    const totalAllocatedCents = loanInstallments.reduce(
      (sum, row) => sum + (row.status === "waived" ? 0n : decimalToCents(row.amount_paid)),
      0n,
    );
    const pendingBalanceCents = totalScheduledCents > totalAllocatedCents
      ? totalScheduledCents - totalAllocatedCents
      : 0n;

    const totalFinancedCents = totalScheduledCents > 0n
      ? totalScheduledCents
      : decimalToCents(loan.principal);

    const progressPercent = totalFinancedCents > 0n
      ? Math.min(100, Math.max(0, Number((totalAllocatedCents * 100n) / totalFinancedCents)))
      : 0;

    const openInstallments = loanInstallments.filter(
      (row) => row.status !== "paid" && row.status !== "waived" && decimalToCents(row.amount_paid) < decimalToCents(row.amount_due),
    );
    const hasOverdue = openInstallments.some((row) => row.due_date < todayIso || row.status === "overdue");
    const nextInst = openInstallments[0] ?? null;
    const nextInstBalanceCents = nextInst
      ? decimalToCents(nextInst.amount_due) - decimalToCents(nextInst.amount_paid)
      : 0n;

    let statusLabel = LOAN_STATUS_LABELS[loan.status] ?? loan.status;
    if (loan.status === "active" && hasOverdue) {
      statusLabel = "Cuota vencida";
    }

    return {
      id: loan.id,
      contractId: loan.contract_id,
      contractNumber: contract?.contract_number ?? `KM-${loan.id.slice(0, 8).toUpperCase()}`,
      contractSignedAt: contract?.signed_at ?? loan.activated_at ?? loan.created_at,
      status: hasOverdue && loan.status === "active" ? "overdue" : loan.status,
      statusLabel,
      device: {
        id: device?.id ?? loan.device_id,
        brand: device?.brand ?? "Equipo",
        model: device?.model ?? "Financiado",
        imeiMasked: maskImei(device?.imei),
        imageCategory: resolveDeviceImageCategory(`${device?.brand ?? ""} ${device?.model ?? ""}`),
      },
      salePrice: String(loan.sale_price),
      salePriceFormatted: formatDop(loan.sale_price),
      downPayment: String(loan.down_payment),
      downPaymentFormatted: formatDop(loan.down_payment),
      principal: String(loan.principal),
      principalFormatted: formatDop(loan.principal),
      totalFinanced: `${totalFinancedCents / 100n}.${(totalFinancedCents % 100n).toString().padStart(2, "0")}`,
      totalFinancedFormatted: formatDopCents(totalFinancedCents),
      totalPaid: `${totalAllocatedCents / 100n}.${(totalAllocatedCents % 100n).toString().padStart(2, "0")}`,
      totalPaidFormatted: formatDopCents(totalAllocatedCents),
      pendingBalance: `${pendingBalanceCents / 100n}.${(pendingBalanceCents % 100n).toString().padStart(2, "0")}`,
      pendingBalanceFormatted: formatDopCents(pendingBalanceCents),
      progressPercent,
      installmentCount: loanInstallments.length || loan.installment_count,
      paidInstallmentsCount: loanInstallments.filter((i) => i.status === "paid").length,
      nextInstallment: nextInst
        ? {
            sequence: nextInst.sequence,
            dueDate: nextInst.due_date,
            amountDue: String(nextInst.amount_due),
            amountDueFormatted: formatDop(nextInst.amount_due),
            balance: `${nextInstBalanceCents / 100n}.${(nextInstBalanceCents % 100n).toString().padStart(2, "0")}`,
            balanceFormatted: formatDopCents(nextInstBalanceCents),
            status: nextInst.due_date < todayIso && nextInst.status !== "paid" ? "overdue" : nextInst.status,
          }
        : null,
      deliveredAt: loan.delivered_at,
      createdAt: loan.created_at,
    };
  });

  const installmentsFormatted = (installmentsRes.data ?? []).map((inst) => {
    const dueCents = decimalToCents(inst.amount_due);
    const paidCents = decimalToCents(inst.amount_paid);
    const balanceCents = dueCents > paidCents ? dueCents - paidCents : 0n;
    const effectiveStatus =
      inst.status === "paid" || balanceCents === 0n
        ? "paid"
        : inst.due_date < todayIso
          ? "overdue"
          : paidCents > 0n
            ? "partial"
            : "pending";

    return {
      id: inst.id,
      loanId: inst.loan_id,
      sequence: inst.sequence,
      dueDate: inst.due_date,
      amountDue: String(inst.amount_due),
      amountDueFormatted: formatDop(inst.amount_due),
      amountPaid: String(inst.amount_paid),
      amountPaidFormatted: formatDop(inst.amount_paid),
      balance: `${balanceCents / 100n}.${(balanceCents % 100n).toString().padStart(2, "0")}`,
      balanceFormatted: formatDopCents(balanceCents),
      status: effectiveStatus as "paid" | "partial" | "pending" | "overdue",
    };
  });

  const loanById = new Map(loanSummaries.map((l) => [l.id, l]));
  const paymentsFormatted = (paymentsRes.data ?? []).map((payment) => {
    const loan = loanById.get(payment.loan_id);
    const isReversed = Boolean(payment.reversed_at);
    return {
      id: payment.id,
      receiptNumber: payment.receipt_number ?? `REC-${payment.id.slice(0, 8).toUpperCase()}`,
      loanId: payment.loan_id,
      contractNumber: loan?.contractNumber ?? "Contrato KrediMax",
      deviceName: loan ? `${loan.device.brand} ${loan.device.model}` : "Equipo financiado",
      amount: String(payment.amount),
      amountFormatted: formatDop(payment.amount),
      currency: payment.currency ?? "DOP",
      receivedAt: payment.received_at,
      paymentMethod: payment.payment_method,
      paymentType: payment.payment_type,
      reference: payment.reference ?? "Pago en sucursal",
      status: isReversed ? ("reversed" as const) : ("confirmed" as const),
      receiptAvailable: !isReversed && Boolean(payment.id),
    };
  });

  return {
    customer: {
      id: customerRes.data.id,
      fullName: customerRes.data.full_name,
      maskedCedula: maskCedula(customerRes.data.identity_number ?? portalAccount.identity_key),
      phone: customerRes.data.phone ?? "No registrado",
      email: ctx.email,
      address: customerRes.data.address ?? "No registrada",
      memberSince: customerRes.data.created_at,
      mustChangePassword: portalAccount.must_change_password,
      companyName: tenantRes.data?.name ?? "KrediMax",
      branchName: branchRes.data?.name ?? "Sucursal Principal",
      assignedExecutive: {
        name:
          portalAccount.executive_name ||
          (customerRes.data as { created_by_name?: string | null }).created_by_name ||
          "Ejecutivo KrediMax",
        roleLabel: "Ejecutivo de venta encargado",
        whatsappPhone: (
          portalAccount.executive_whatsapp ||
          process.env.NEXT_PUBLIC_DEFAULT_EXECUTIVE_WHATSAPP ||
          "18095550188"
        ).replace(/\D/g, ""),
        whatsappFormatted:
          portalAccount.executive_whatsapp ||
          process.env.NEXT_PUBLIC_DEFAULT_EXECUTIVE_WHATSAPP ||
          "+1 (809) 555-0188",
      },
    },
    loans: loanSummaries,
    installments: installmentsFormatted,
    payments: paymentsFormatted,
  };
}

/**
 * Provisions or resets a customer's mobile portal account when a loan is activated
 * or when requested by an authorized administrator.
 * Never uses the last 4 digits of the cédula as password; generates a random temporary
 * password and sets `must_change_password = true`.
 */
export async function provisionCustomerPortalCredentials(params: {
  tenantId: string;
  actorId: string;
  customerId: string;
  identityNumber: string;
  fullName: string;
  email?: string | null;
  executiveName?: string | null;
  executiveWhatsapp?: string | null;
}): Promise<
  | {
      ok: true;
      portalAccountId: string;
      maskedCedula: string;
      temporaryPassword: string;
      mustChangePassword: true;
    }
  | { ok: false; code: string; message: string }
> {
  const digits = normalizeDominicanCedula(params.identityNumber);
  if (!digits) {
    return {
      ok: false,
      code: "INVALID_CEDULA",
      message: "El cliente debe tener una cédula dominicana válida de 11 dígitos para activar su cuenta móvil.",
    };
  }

  if (!isUserProvisioningConfigured()) {
    return {
      ok: false,
      code: "PROVISIONING_NOT_CONFIGURED",
      message: "La administración de cuentas no está configurada en este servidor.",
    };
  }

  const authEmail = resolveCustomerPortalAuthEmail(digits);
  if (!authEmail) {
    return {
      ok: false,
      code: "INVALID_CEDULA",
      message: "No se pudo normalizar el documento del cliente.",
    };
  }

  const temporaryPassword = generateTemporaryCustomerPassword(digits);
  const admin = createSupabaseAdminClient();

  const { data: existingPortal } = await admin
    .from("customer_portal_accounts")
    .select("id, user_id")
    .eq("tenant_id", params.tenantId)
    .eq("customer_id", params.customerId)
    .maybeSingle();

  let targetUserId = existingPortal?.user_id ?? null;

  if (targetUserId) {
    const updated = await admin.auth.admin.updateUserById(targetUserId, {
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: {
        full_name: params.fullName,
        contact_email: params.email ?? null,
      },
      app_metadata: {
        kredimax_account_type: "customer_portal",
        kredimax_tenant_id: params.tenantId,
        kredimax_customer_id: params.customerId,
        kredimax_must_change_password: true,
      },
    });
    if (updated.error) {
      return {
        ok: false,
        code: "AUTH_UPDATE_FAILED",
        message: "No se pudo generar la credencial temporal del cliente.",
      };
    }
  } else {
    const created = await admin.auth.admin.createUser({
      email: authEmail,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: {
        full_name: params.fullName,
        contact_email: params.email ?? null,
      },
      app_metadata: {
        kredimax_account_type: "customer_portal",
        kredimax_tenant_id: params.tenantId,
        kredimax_customer_id: params.customerId,
        kredimax_must_change_password: true,
      },
    });
    if (created.error || !created.data.user) {
      return {
        ok: false,
        code: "AUTH_CREATE_FAILED",
        message: "No se pudo crear la cuenta de acceso para el cliente.",
      };
    }
    targetUserId = created.data.user.id;
  }

  const { data: portalAccountId, error: rpcError } = await admin.rpc(
    "provision_customer_portal_account",
    {
      p_tenant_id: params.tenantId,
      p_actor_id: params.actorId,
      p_customer_id: params.customerId,
      p_user_id: targetUserId,
      p_identity_key: digits,
    },
  );

  if (rpcError || !portalAccountId) {
    return {
      ok: false,
      code: "PORTAL_RPC_FAILED",
      message: "No se pudo vincular la cuenta móvil al expediente del cliente.",
    };
  }

  if (params.executiveName || params.executiveWhatsapp) {
    await admin
      .from("customer_portal_accounts")
      .update({
        executive_name: params.executiveName ?? null,
        executive_whatsapp: params.executiveWhatsapp ?? null,
      })
      .eq("id", String(portalAccountId))
      .eq("tenant_id", params.tenantId);
  }

  return {
    ok: true,
    portalAccountId: String(portalAccountId),
    maskedCedula: maskCedula(digits),
    temporaryPassword,
    mustChangePassword: true,
  };
}
