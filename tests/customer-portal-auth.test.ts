import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const createClientMock = vi.fn();
vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

const createSupabaseServerClientMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => createSupabaseServerClientMock(),
}));

const createSupabaseAdminClientMock = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => createSupabaseAdminClientMock(),
  isUserProvisioningConfigured: () => true,
}));

import {
  normalizeDominicanCedula,
  formatCedulaDashes,
  maskCedula,
  validateCustomerPasswordPolicy,
  generateTemporaryCustomerPassword,
  checkCustomerAuthRateLimit,
  resetCustomerAuthRateLimit,
  getAuthenticatedCustomerPortalContext,
} from "../src/lib/security/customer-portal-auth";
import { GET as getResumen } from "../src/app/api/clientes-mobile/resumen/route";
import { GET as getCuotas } from "../src/app/api/clientes-mobile/cuotas/route";
import { GET as getRecibo } from "../src/app/api/clientes-mobile/recibos/[paymentId]/route";

describe("customer-portal-auth — cédula privacy & formatting", () => {
  it("normalizes valid 11-digit Dominican cédulas with or without dashes", () => {
    expect(normalizeDominicanCedula("001-1234567-8")).toBe("00112345678");
    expect(normalizeDominicanCedula(" 00112345678 ")).toBe("00112345678");
  });

  it("rejects invalid cédula lengths or empty values", () => {
    expect(normalizeDominicanCedula("12345")).toBeNull();
    expect(normalizeDominicanCedula("00000000000")).toBeNull();
    expect(normalizeDominicanCedula("")).toBeNull();
  });

  it("formats 11-digit cédula with standard Dominican dashes", () => {
    expect(formatCedulaDashes("00112345678")).toBe("001-1234567-8");
  });

  it("masks cédula so full identity number is never exposed in UI, logs, or errors", () => {
    const raw = "001-2345890-1";
    const masked = maskCedula(raw);
    expect(masked).toBe("***-****890-1");
    expect(masked).not.toContain("001");
    expect(masked).not.toContain("2345");
  });
});

describe("customer-portal-auth — password policy & temporary password security", () => {
  const sampleCedula = "001-2345890-1";

  it("explicitly forbids using the last 4 digits of the cédula in the password", () => {
    const result = validateCustomerPasswordPolicy("Kredi8901!ab", sampleCedula);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toMatch(/últimos 4 dígitos/i);
    }
  });

  it("forbids containing the full cédula or 4+ consecutive cédula digits", () => {
    const full = validateCustomerPasswordPolicy("Km00123458901!", sampleCedula);
    expect(full.valid).toBe(false);

    const middleSeq = validateCustomerPasswordPolicy("Segura2345!xy", sampleCedula);
    expect(middleSeq.valid).toBe(false);
  });

  it("enforces minimum length and character diversity", () => {
    expect(validateCustomerPasswordPolicy("Abc12!", sampleCedula).valid).toBe(false);
    expect(validateCustomerPasswordPolicy("sololetrasgrandes", sampleCedula).valid).toBe(false);
    expect(validateCustomerPasswordPolicy("123456789012", sampleCedula).valid).toBe(false);
  });

  it("accepts strong passwords that do not contain cédula sequences", () => {
    const valid = validateCustomerPasswordPolicy("KrediMax#7492Qp", sampleCedula);
    expect(valid).toEqual({ valid: true });
  });

  it("generates random temporary passwords that pass policy and never contain last 4 cédula digits", () => {
    for (let i = 0; i < 25; i += 1) {
      const temp = generateTemporaryCustomerPassword(sampleCedula);
      expect(temp.length).toBeGreaterThanOrEqual(12);
      expect(temp).not.toContain("8901");
      expect(validateCustomerPasswordPolicy(temp, sampleCedula)).toEqual({ valid: true });
    }
  });
});

describe("customer-portal-auth — rate limiting", () => {
  const bucketKey = "test:login:ip-1";

  beforeEach(() => {
    resetCustomerAuthRateLimit(bucketKey);
  });

  it("allows initial attempts and blocks after exceeding maxAttempts", () => {
    expect(checkCustomerAuthRateLimit(bucketKey, 3, 60_000).allowed).toBe(true);
    expect(checkCustomerAuthRateLimit(bucketKey, 3, 60_000).allowed).toBe(true);
    expect(checkCustomerAuthRateLimit(bucketKey, 3, 60_000).allowed).toBe(true);

    const fourth = checkCustomerAuthRateLimit(bucketKey, 3, 60_000);
    expect(fourth.allowed).toBe(false);
    expect(fourth.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("resets rate limit bucket upon successful authentication", () => {
    checkCustomerAuthRateLimit(bucketKey, 2, 60_000);
    checkCustomerAuthRateLimit(bucketKey, 2, 60_000);
    expect(checkCustomerAuthRateLimit(bucketKey, 2, 60_000).allowed).toBe(false);

    resetCustomerAuthRateLimit(bucketKey);
    expect(checkCustomerAuthRateLimit(bucketKey, 2, 60_000).allowed).toBe(true);
  });
});

describe("customer-portal-auth — authentication & cross-customer isolation", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test_key";
    createClientMock.mockReset();
    createSupabaseServerClientMock.mockReset();
  });

  it("rejects requests without Bearer token with HTTP 401", async () => {
    createSupabaseServerClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: { message: "No session" },
        }),
      },
    });

    const req = new Request("https://kredimax.local/api/clientes-mobile/resumen");
    const auth = await getAuthenticatedCustomerPortalContext(req);
    expect(auth.ok).toBe(false);
    if (!auth.ok) {
      expect(auth.status).toBe(401);
      expect(auth.code).toBe("UNAUTHENTICATED");
    }

    const res = await getResumen(req);
    expect(res.status).toBe(401);
  });

  it("ignores client-supplied customer_id and strictly scopes queries to authenticated customer's tenant_id + customer_id", async () => {
    const authCustomerId = "11111111-1111-4111-8111-111111111111";
    const otherCustomerId = "99999999-9999-4999-8999-999999999999";
    const tenantId = "22222222-2222-4222-8222-222222222222";
    const loanId = "33333333-3333-4333-8333-333333333333";
    const contractId = "44444444-4444-4444-8444-444444444444";
    const deviceId = "55555555-5555-4555-8555-555555555555";

    const observedFilters: Array<{ table: string; column: string; value: unknown }> = [];

    createClientMock.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "auth-user-1", email: "cedula.00123458901@clientes.kredimax.local" } },
          error: null,
        }),
      },
      from: (table: string) => {
        const chain: Record<string, unknown> = {
          select: () => chain,
          eq: (column: string, value: unknown) => {
            observedFilters.push({ table, column, value });
            return chain;
          },
          in: () => chain,
          order: () => chain,
          maybeSingle: async () => {
            if (table === "customer_portal_accounts") {
              return {
                data: {
                  id: "portal-1",
                  tenant_id: tenantId,
                  branch_id: null,
                  customer_id: authCustomerId,
                  identity_key: "00123458901",
                  status: "active",
                  must_change_password: false,
                  password_changed_at: "2026-01-15T12:00:00Z",
                  last_login_at: "2026-01-15T12:00:00Z",
                  locked_until: null,
                },
                error: null,
              };
            }
            if (table === "customers") {
              return {
                data: {
                  id: authCustomerId,
                  full_name: "Juan Pérez",
                  identity_number: "001-2345890-1",
                  phone: "809-555-0192",
                  address: "Santo Domingo",
                  created_at: "2026-01-15T12:00:00Z",
                },
                error: null,
              };
            }
            if (table === "tenants") {
              return {
                data: { name: "KrediMax", legal_name: "KrediMax SRL", currency: "DOP", timezone: "America/Santo_Domingo" },
                error: null,
              };
            }
            return { data: null, error: null };
          },
          then: (resolve: (val: unknown) => void) => {
            if (table === "loans") {
              resolve({
                data: [
                  {
                    id: loanId,
                    contract_id: contractId,
                    device_id: deviceId,
                    status: "active",
                    sale_price: "35000.00",
                    down_payment: "5000.00",
                    principal: "30000.00",
                    installment_count: 12,
                    delivered_at: "2026-01-15T12:00:00Z",
                    activated_at: "2026-01-15T12:00:00Z",
                    created_at: "2026-01-15T12:00:00Z",
                  },
                ],
                error: null,
              });
              return;
            }
            if (table === "credit_contracts") {
              resolve({
                data: [
                  {
                    id: contractId,
                    contract_number: "KM-2026-0042",
                    signed_at: "2026-01-15T12:00:00Z",
                    terms: {},
                  },
                ],
                error: null,
              });
              return;
            }
            if (table === "installments") {
              resolve({
                data: [
                  {
                    id: "inst-1",
                    loan_id: loanId,
                    sequence: 1,
                    due_date: "2026-02-15",
                    amount_due: "12000.00",
                    amount_paid: "12000.00",
                    status: "paid",
                  },
                  {
                    id: "inst-2",
                    loan_id: loanId,
                    sequence: 2,
                    due_date: "2026-12-15",
                    amount_due: "18000.00",
                    amount_paid: "0.00",
                    status: "pending",
                  },
                ],
                error: null,
              });
              return;
            }
            if (table === "devices") {
              resolve({
                data: [
                  {
                    id: deviceId,
                    brand: "Samsung",
                    model: "Galaxy A55",
                    imei: "359123456789012",
                  },
                ],
                error: null,
              });
              return;
            }
            resolve({ data: [], error: null });
          },
        };
        return chain;
      },
    });

    // Attacker tries to pass another customer's ID in query string
    const req = new Request(
      `https://kredimax.local/api/clientes-mobile/resumen?customer_id=${otherCustomerId}`,
      {
        headers: { Authorization: "Bearer valid-jwt-token" },
      },
    );

    const res = await getResumen(req);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.customer.id).toBe(authCustomerId);
    expect(body.customer.maskedCedula).toBe("***-****890-1");
    expect(body.selectedLoan.totalFinanced).toBe("30000.00");
    expect(body.selectedLoan.totalPaid).toBe("12000.00");
    expect(body.selectedLoan.pendingBalance).toBe("18000.00");
    expect(body.selectedLoan.progressPercent).toBe(40);

    // Verify no query ever used the attacker's customer_id
    const customerIdFilters = observedFilters.filter((f) => f.column === "customer_id");
    expect(customerIdFilters.length).toBeGreaterThan(0);
    for (const filter of customerIdFilters) {
      expect(filter.value).toBe(authCustomerId);
      expect(filter.value).not.toBe(otherCustomerId);
    }
  });

  it("blocks access to another customer's loanId in /api/clientes-mobile/cuotas with HTTP 403", async () => {
    const authCustomerId = "11111111-1111-4111-8111-111111111111";
    const tenantId = "22222222-2222-4222-8222-222222222222";

    createClientMock.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "auth-user-1", email: "cliente@kredimax.do" } },
          error: null,
        }),
      },
      from: (table: string) => {
        const chain: Record<string, unknown> = {
          select: () => chain,
          eq: () => chain,
          in: () => chain,
          order: () => chain,
          maybeSingle: async () => {
            if (table === "customer_portal_accounts") {
              return {
                data: {
                  id: "portal-1",
                  tenant_id: tenantId,
                  branch_id: null,
                  customer_id: authCustomerId,
                  identity_key: "00123458901",
                  status: "active",
                  must_change_password: false,
                  password_changed_at: "2026-01-15T12:00:00Z",
                  last_login_at: "2026-01-15T12:00:00Z",
                  locked_until: null,
                },
                error: null,
              };
            }
            if (table === "customers") {
              return {
                data: {
                  id: authCustomerId,
                  full_name: "Juan Pérez",
                  identity_number: "001-2345890-1",
                  phone: "809-555-0192",
                  address: "Santo Domingo",
                  created_at: "2026-01-15T12:00:00Z",
                },
                error: null,
              };
            }
            return { data: null, error: null };
          },
          then: (resolve: (val: unknown) => void) => resolve({ data: [], error: null }),
        };
        return chain;
      },
    });

    const foreignLoanId = "88888888-8888-4888-8888-888888888888";
    const req = new Request(
      `https://kredimax.local/api/clientes-mobile/cuotas?loanId=${foreignLoanId}`,
      {
        headers: { Authorization: "Bearer valid-jwt-token" },
      },
    );

    const res = await getCuotas(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("LOAN_FORBIDDEN_OR_NOT_FOUND");
  });

  it("blocks access to unauthorized or non-existent payment receipt in /api/clientes-mobile/recibos/[paymentId]", async () => {
    const authCustomerId = "11111111-1111-4111-8111-111111111111";
    const tenantId = "22222222-2222-4222-8222-222222222222";

    createClientMock.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "auth-user-1", email: "cliente@kredimax.do" } },
          error: null,
        }),
      },
      from: (table: string) => {
        const chain: Record<string, unknown> = {
          select: () => chain,
          eq: () => chain,
          in: () => chain,
          order: () => chain,
          maybeSingle: async () => {
            if (table === "customer_portal_accounts") {
              return {
                data: {
                  id: "portal-1",
                  tenant_id: tenantId,
                  branch_id: null,
                  customer_id: authCustomerId,
                  identity_key: "00123458901",
                  status: "active",
                  must_change_password: false,
                  password_changed_at: "2026-01-15T12:00:00Z",
                  last_login_at: "2026-01-15T12:00:00Z",
                  locked_until: null,
                },
                error: null,
              };
            }
            if (table === "customers") {
              return {
                data: {
                  id: authCustomerId,
                  full_name: "Juan Pérez",
                  identity_number: "001-2345890-1",
                  phone: "809-555-0192",
                  address: "Santo Domingo",
                  created_at: "2026-01-15T12:00:00Z",
                },
                error: null,
              };
            }
            return { data: null, error: null };
          },
          then: (resolve: (val: unknown) => void) => resolve({ data: [], error: null }),
        };
        return chain;
      },
    });

    const foreignPaymentId = "77777777-7777-4777-8777-777777777777";
    const req = new Request(
      `https://kredimax.local/api/clientes-mobile/recibos/${foreignPaymentId}`,
      {
        headers: { Authorization: "Bearer valid-jwt-token" },
      },
    );

    const res = await getRecibo(req, { params: Promise.resolve({ paymentId: foreignPaymentId }) });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe("RECEIPT_NOT_FOUND");
  });
});
