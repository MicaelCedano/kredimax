import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseServerClient, cookies } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  cookies: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient }));
vi.mock("next/headers", () => ({ cookies }));

import { getTenantAccess } from "@/lib/security/tenant-access";

const userId = "10000000-0000-4000-8000-000000000001";
const tenantId = "20000000-0000-4000-8000-000000000001";

function query(result: { data: unknown; error: null }) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  return builder;
}

describe("getTenantAccess tenant suspension", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stops before role or permission lookup when the selected tenant is suspended", async () => {
    const membership = query({
      data: { tenant_id: tenantId, branch_id: null, role: "tenant_admin" },
      error: null,
    });
    const tenant = query({ data: { status: "suspended" }, error: null });
    const from = vi.fn((table: string) => {
      if (table === "tenant_memberships") return membership;
      if (table === "tenants") return tenant;
      throw new Error(`Unexpected table lookup: ${table}`);
    });
    const supabase = {
      auth: { getClaims: vi.fn().mockResolvedValue({ data: { claims: { sub: userId } } }) },
      from,
    };
    createSupabaseServerClient.mockResolvedValue(supabase);
    cookies.mockResolvedValue({ get: vi.fn(() => ({ value: tenantId })) });

    const result = await getTenantAccess("payments.record");

    expect(result).toEqual({ ok: false, reason: "tenant-suspended" });
    expect(from.mock.calls.map(([table]) => table)).toEqual(["tenant_memberships", "tenants"]);
  });
});
