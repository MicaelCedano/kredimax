import { beforeEach, describe, expect, it, vi } from "vitest";

const { getTenantAccess, rpc, revalidatePath } = vi.hoisted(() => ({ getTenantAccess: vi.fn(), rpc: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("@/lib/security/tenant-access", () => ({ getTenantAccess }));
vi.mock("next/cache", () => ({ revalidatePath }));
import { deliverCashDrawer, openCashDrawer, receiveCashDrawer } from "@/modules/cash/actions";

const branch = "11000000-0000-4000-8000-000000000001", seller = "21000000-0000-4000-8000-000000000001";
function form(prefix = "down_payment-") {
  const data = new FormData();
  for (const [key, value] of Object.entries({ branchId: branch, sellerId: seller, day: "2026-10-26" })) data.set(key, value);
  for (const [key, value] of Object.entries({ cash: "3300.00", transfer: "3600.00", other: "0.00", notes: "" })) data.set(prefix + key, value);
  return data;
}
describe("cash drawer actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTenantAccess.mockResolvedValue({ ok: true, membership: { tenant_id: "session-tenant" }, supabase: { rpc } });
    rpc.mockResolvedValue({ data: "closing-id", error: null });
  });
  it.each([openCashDrawer, deliverCashDrawer, receiveCashDrawer])("rejects missing permission before mutation", async action => {
    getTenantAccess.mockResolvedValue({ ok: false, reason: "forbidden" });
    expect((await action({}, form())).error).toBeTruthy();
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([["down_payment-cash", "1.001"], ["down_payment-cash", "NaN"], ["down_payment-cash", "1000000000000"], ["day", "2026-02-30"], ["sellerId", "x"]])("rejects malformed %s=%s", async (key, value) => {
    const data = form(); data.set(key, value);
    expect((await deliverCashDrawer({}, data)).error).toBeTruthy();
    expect(rpc).not.toHaveBeenCalled();
  });
  it("opens the authenticated operator's drawer without using a supplied seller", async () => {
    expect(await openCashDrawer({}, form())).toEqual({ saved: true });
    expect(rpc).toHaveBeenCalledWith("open_cash_drawer", { p_tenant_id: "session-tenant", p_branch_id: branch, p_day: "2026-10-26" });
  });
  it("sends all counts in one call and refreshes the report after success", async () => {
    const data = form(); data.set("tenantId", "forged-tenant");
    for (const [key, value] of Object.entries({ cash: "0", transfer: "0.00", other: "125", notes: "" })) data.set("installment-" + key, value);
    expect(await deliverCashDrawer({}, data)).toEqual({ saved: true });
    expect(getTenantAccess).toHaveBeenCalledWith("cash.close");
    expect(rpc).toHaveBeenCalledWith("deliver_cash_drawer", { p_tenant_id: "session-tenant", p_branch_id: branch, p_seller_id: seller,
      p_day: "2026-10-26", p_counts: { down_payment: { cash: "3300.00", transfer: "3600.00", other: "0.00", notes: "" },
        installment: { cash: "0", transfer: "0.00", other: "125", notes: "" } } });
    expect(revalidatePath).toHaveBeenCalledWith("/cajas");
  });
  it("records independently counted receipt amounts using the receipt permission", async () => {
    expect(await receiveCashDrawer({}, form(""))).toEqual({ saved: true });
    expect(getTenantAccess).toHaveBeenCalledWith("cash.receive");
    expect(rpc).toHaveBeenCalledWith("receive_cash_drawer", { p_tenant_id: "session-tenant", p_branch_id: branch, p_seller_id: seller,
      p_day: "2026-10-26", p_cash: "3300.00", p_transfer: "3600.00", p_other: "0.00", p_notes: "" });
  });
  it.each(["CLOSING_DIFFERENCE_REASON_REQUIRED", "CASH_ALREADY_DELIVERED", "FORBIDDEN", "DATABASE_UNAVAILABLE"])("reports %s without confirming delivery", async message => {
    rpc.mockResolvedValue({ error: { message } });
    const result = await deliverCashDrawer({}, form());
    expect(result.error).toBeTruthy(); expect(result.saved).toBeUndefined(); expect(revalidatePath).not.toHaveBeenCalled();
  });
  it("surfaces a receipt discrepancy without reporting a saved receipt", async () => {
    rpc.mockResolvedValue({ error: { message: "RECEIPT_DIFFERENCE_REASON_REQUIRED" } });
    expect(await receiveCashDrawer({}, form(""))).toEqual({ error: "Explica la diferencia entre lo declarado y lo recibido." });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
