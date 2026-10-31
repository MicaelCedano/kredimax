import { beforeEach, describe, expect, it, vi } from "vitest";

const { getTenantAccess, rpc, revalidatePath } = vi.hoisted(() => ({ getTenantAccess: vi.fn(), rpc: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("@/lib/security/tenant-access", () => ({ getTenantAccess }));
vi.mock("next/cache", () => ({ revalidatePath }));
import { closeCashDay } from "@/modules/cash/actions";

const branch = "11000000-0000-4000-8000-000000000001", seller = "21000000-0000-4000-8000-000000000001";
function form() {
  const data = new FormData();
  for (const [key, value] of Object.entries({ branchId: branch, sellerId: seller, day: "2026-10-26", type: "down_payment", cash: "3300.00", transfer: "3600.00", other: "0.00", notes: "" })) data.set(key, value);
  return data;
}
describe("closeCashDay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTenantAccess.mockResolvedValue({ ok: true, membership: { tenant_id: "session-tenant" }, supabase: { rpc } });
    rpc.mockResolvedValue({ data: "closing-id", error: null });
  });
  it("rejects missing permission before mutation", async () => {
    getTenantAccess.mockResolvedValue({ ok: false, reason: "forbidden" });
    expect((await closeCashDay({}, form())).error).toBeTruthy();
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([["cash", "1.001"], ["cash", "NaN"], ["cash", "1000000000000"], ["day", "2026-02-30"], ["sellerId", "x"], ["type", "refund"]])("rejects malformed %s=%s", async (key, value) => {
    const data = form(); data.set(key, value);
    expect((await closeCashDay({}, data)).error).toBeTruthy();
    expect(rpc).not.toHaveBeenCalled();
  });
  it("takes the tenant from the authenticated session and refreshes the report after success", async () => {
    const data = form(); data.set("tenantId", "forged-tenant");
    expect(await closeCashDay({}, data)).toEqual({ saved: true });
    expect(getTenantAccess).toHaveBeenCalledWith("cash.close");
    expect(rpc).toHaveBeenCalledWith("close_cash_day", { p_tenant_id: "session-tenant", p_branch_id: branch, p_seller_id: seller,
      p_day: "2026-10-26", p_type: "down_payment", p_cash: "3300.00", p_transfer: "3600.00", p_other: "0.00", p_notes: "" });
    expect(revalidatePath).toHaveBeenCalledWith("/cajas");
  });
  it.each(["CLOSING_DIFFERENCE_REASON_REQUIRED", "CASH_ALREADY_CLOSED", "FORBIDDEN", "DATABASE_UNAVAILABLE"])("reports %s without confirming a saved close", async message => {
    rpc.mockResolvedValue({ error: { message } });
    const result = await closeCashDay({}, form());
    expect(result.error).toBeTruthy(); expect(result.saved).toBeUndefined(); expect(revalidatePath).not.toHaveBeenCalled();
  });
});
