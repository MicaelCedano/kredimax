import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getTenantAccess, from, rpc } = vi.hoisted(() => ({ getTenantAccess: vi.fn(), from: vi.fn(), rpc: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/security/tenant-access", () => ({ getTenantAccess }));
import { createCreditApplication, reviewCreditApplication, saveFinancingSettings } from "@/modules/financing/actions";

function request(imei: string) {
  const data = new FormData();
  for (const [name,value] of Object.entries({
    submissionKey:"81000000-0000-4000-8000-000000000001",customerMode:"new",customerFullName:"Cliente de prueba",
    brand:"Apple",model:"iPhone 13",imei,condition:"new",salePrice:"20000.00",termMonths:"5",frequency:"fortnightly",
    firstInstallmentDate:"2026-10-21",
  })) data.set(name,value);
  return data;
}

describe("Application validation before persistence", () => {
  afterEach(() => vi.useRealTimers());
  beforeEach(() => {
    vi.clearAllMocks();
    getTenantAccess.mockResolvedValue({ok:true,membership:{tenant_id:"tenant-test"},supabase:{from,rpc}});
  });
  it("accepts any 15-digit numeric IMEI during form validation without check-digit rejection", async () => {
    const result = await createCreditApplication(null, request("359293857383452"));
    expect(result?.fieldErrors?.imei).toBeUndefined();
  });
  it("returns an explicit IMEI error when the IMEI does not have 15 digits", async () => {
    const result = await createCreditApplication(null, request("23231231321321"));
    expect(result?.state).toBe("invalid-form");
    expect(result?.fieldErrors?.imei).toContain("15 dígitos");
    expect(from).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
  it("rejects an incomplete reference identity before saving", async () => {
    const data = request("490154203237518");
    data.set("referenceIdentityNumber", "001-12");
    const result = await createCreditApplication(null, data);
    expect(result?.state).toBe("invalid-form");
    expect(result?.fieldErrors?.referenceIdentityNumber).toContain("11 dígitos");
    expect(from).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
  it("accepts an optional reference identity with eleven digits", async () => {
    const data = request("490154203237518");
    data.set("referenceIdentityNumber", "00000000000");
    const result = await createCreditApplication(null, data);
    expect(result?.fieldErrors?.referenceIdentityNumber).toBeUndefined();
  });
  it.each([18, 24])("prevents enabling the removed %i-month term through settings", async (termMonths) => {
    const data = new FormData();
    data.set("downPaymentPercent", "30.00");
    data.set("annualRatePercent", "48.00");
    data.set("legalExpenses", "1000.00");
    data.append("allowedTerms", String(termMonths));
    expect(await saveFinancingSettings(null, data)).toEqual({ state: "settings-invalid" });
    expect(from).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([18, 24])("rejects a new %i-month application even when old settings include it", async (termMonths) => {
    const branchId = "71000000-0000-4000-8000-000000000001";
    from.mockImplementation((table: string) => {
      const query = {
        select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ error: null, data: table === "branches" ? { id: branchId, name: "Sucursal de prueba" } : {
          down_payment_percent: "30.00", annual_rate_percent: "48.000", legal_expenses: "1000.00",
          allowed_terms: [3, 5, 6, 8, 12, 18, 24], recovery_target_percent: "100.00", recovery_enabled: false,
        } }),
      };
      return query;
    });
    const data = request("490154203237518");
    data.set("branchId", branchId);
    data.set("termMonths", String(termMonths));
    const result = await createCreditApplication(null, data);
    expect(result?.state).toBe("term-not-allowed");
    expect(result?.fieldErrors?.termMonths).toContain("plazos habilitados");
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([["monthly", "2026-11-23"], ["fortnightly", "2026-11-08"]])("derives %s preview dates on the server instead of trusting a posted date", async (frequency, expected) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-24T14:00:00Z"));
    const branchId = "71000000-0000-4000-8000-000000000001";
    from.mockImplementation((table: string) => ({
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ error: null, data: table === "branches" ? { id: branchId, name: "Sucursal" } : {
        down_payment_percent: "30.00", annual_rate_percent: "48.000", legal_expenses: "1000.00",
        allowed_terms: [3,5,6,8,12], recovery_target_percent: "100.00", recovery_enabled: false,
      } }),
    }));
    rpc.mockResolvedValue({ data: null, error: { code: "23505", message: "Disposable save stub" } });
    const data = request("490154203237518");
    data.set("branchId", branchId);
    data.set("frequency", frequency);
    data.set("firstInstallmentDate", "2099-01-01");
    await createCreditApplication(null, data);
    expect(rpc).toHaveBeenCalledWith("create_customer_and_credit_application", expect.objectContaining({
      p_quote_snapshot: expect.objectContaining({ firstInstallmentDate: expected, frequency }),
    }));
  });
  it.each(["level_v1", "balanced_20_v1", undefined])("honors the saved recovery policy when reviewing %s", async (paymentDistribution) => {
    const applicationId = "81000000-0000-4000-8000-000000000002";
    from.mockReturnValue({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { id: applicationId, quote_snapshot: { paymentDistribution, recoveryMet: false, proposedAdjustment: "0.00" } } }) });
    rpc.mockResolvedValue({ data: applicationId, error: null });
    const form = new FormData(); form.set("applicationId", applicationId); form.set("decision", "approved");
    const result = await reviewCreditApplication(null, form);
    if (paymentDistribution === "level_v1" || paymentDistribution === "balanced_20_v1") expect(rpc).toHaveBeenCalledWith("review_credit_application", expect.objectContaining({ p_application_id: applicationId, p_decision: "approved" }));
    else { expect(result).toEqual({ state: "recovery-review-required" }); expect(rpc).not.toHaveBeenCalled(); }
  });
});
