import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getTenantAccess: vi.fn(), loadHandoverContext: vi.fn(), revalidatePath: vi.fn(), redirect: vi.fn(), update: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/security/tenant-access", () => ({ getTenantAccess: mocks.getTenantAccess }));
vi.mock("@/modules/financing/handover-context.server", () => ({ loadHandoverContext: mocks.loadHandoverContext }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
import { completeHandoverProfile } from "../src/modules/financing/handover-actions";

const applicationId = "21000000-0000-4000-8000-000000000001";
const customerId = "11000000-0000-4000-8000-000000000001";
function data() {
  const form = new FormData();
  for (const [key, value] of Object.entries({ applicationId, identity_number: "DEMO-01", phone: "8095550101", address: "Calle de prueba 1", home_location: "Referencia precisa de prueba", reference_name: "Referencia de prueba", reference_phone: "8095550102", referenceConsent: "on", monthly_income: "999999", branch_id: "otra-sucursal" })) form.set(key, value);
  return form;
}
describe("completeHandoverProfile", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    const query = { eq: vi.fn(), select: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: { id: customerId }, error: null }) };
    query.eq.mockReturnValue(query); query.select.mockReturnValue(query);
    mocks.update.mockReturnValue(query); mocks.from.mockReturnValue({ update: mocks.update });
    mocks.getTenantAccess.mockResolvedValue({ ok: true, membership: { tenant_id: "tenant-a", role: "branch_manager", branch_id: "branch-a" }, supabase: { from: mocks.from } });
    mocks.loadHandoverContext.mockResolvedValue({ loan: { status: "approved" }, customer: { id: customerId, branch_id: "branch-a" } });
    mocks.redirect.mockImplementation((path: string) => { throw new Error(`REDIRECT:${path}`); });
  });
  it("requires permission to write customer data before updating anything", async () => {
    mocks.getTenantAccess.mockImplementation(async (permission: string) => permission === "customers.write" ? { ok: false, reason: "forbidden" } : { ok: true, membership: { tenant_id: "tenant-a" } });
    expect(await completeHandoverProfile(null, data())).toEqual({ state: "forbidden" });
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("requires consent and complete reference data", async () => {
    const form = data(); form.delete("referenceConsent");
    expect(await completeHandoverProfile(null, form)).toEqual({ state: "reference-consent-required" });
    form.set("referenceConsent", "on"); form.set("reference_phone", "");
    expect(await completeHandoverProfile(null, form)).toEqual({ state: "invalid" });
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("does not allow another branch or an already delivered loan", async () => {
    mocks.loadHandoverContext.mockResolvedValue({ loan: { status: "approved" }, customer: { id: customerId, branch_id: "branch-b" } });
    expect(await completeHandoverProfile(null, data())).toEqual({ state: "forbidden" });
    mocks.loadHandoverContext.mockResolvedValue({ loan: { status: "active" }, customer: { id: customerId, branch_id: "branch-a" } });
    expect(await completeHandoverProfile(null, data())).toEqual({ state: "not-pending" });
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("updates only the six contact fields, preserving financial, branch and approval data", async () => {
    await expect(completeHandoverProfile(null, data())).rejects.toThrow(`REDIRECT:/solicitudes/${applicationId}/entrega?estado=datos-completados`);
    expect(mocks.from).toHaveBeenCalledExactlyOnceWith("customers");
    expect(mocks.update).toHaveBeenCalledWith({ identity_number: "DEMO-01", phone: "809-555-0101", address: "Calle de prueba 1", home_location: "Referencia precisa de prueba", reference_name: "Referencia de prueba", reference_phone: "809-555-0102", updated_at: expect.any(String) });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/solicitudes/${applicationId}/acta`);
  });
});
