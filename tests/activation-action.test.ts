import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getTenantAccess, revalidatePath, redirect, rpc } = vi.hoisted(() => ({
  getTenantAccess: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/security/tenant-access", () => ({ getTenantAccess }));

import { activateApprovedLoan } from "@/modules/financing/actions";

const ids = {
  applicationId: "21000000-0000-4000-8000-000000000001",
  loanId: "61000000-0000-4000-8000-000000000001",
  idempotencyKey: "81000000-0000-4000-8000-000000000001",
};

function formData(includeAttestation: boolean) {
  const form = new FormData();
  form.set("applicationId", ids.applicationId);
  form.set("loanId", ids.loanId);
  form.set("idempotencyKey", ids.idempotencyKey);
  form.set("paymentMethod", "cash");
  form.set("paymentReference", "RECIBO-PRUEBA-01");
  form.set("signedDocumentPath", "expediente/contrato-ficticio-01");
  if (includeAttestation) form.set("contractEvidenceAttested", "on");
  form.set("deliveryDate", "2026-10-20");
  return form;
}

function allowedAccess() {
  const supabase = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: ids.loanId, branch_id: "branch-test" }, error: null }) })),
        })),
      })),
    })),
    rpc,
  };
  return { ok: true, supabase, membership: { tenant_id: "tenant-test" } };
}

describe("activateApprovedLoan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTenantAccess.mockResolvedValue(allowedAccess());
    rpc.mockResolvedValue({ error: null });
    redirect.mockImplementation((path: string) => { throw new Error(`NEXT_REDIRECT:${path}`); });
  });

  it("rejects activation without signed-contract attestation before querying or mutating", async () => {
    const result = await activateApprovedLoan({}, formData(false));

    expect(result.error).toMatch(/confirma el contrato firmado\/documentado/);
    expect(getTenantAccess).toHaveBeenCalledTimes(1);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects impossible delivery dates before loading or activating the loan", async () => {
    const form = formData(true);
    form.set("deliveryDate", "2026-02-30");

    const result = await activateApprovedLoan({}, form);

    expect(result.error).toMatch(/fecha de entrega válida/);
    expect(getTenantAccess).toHaveBeenCalledTimes(1);
    expect(rpc).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("rejects a cash initial payment without its image before any RPC", async () => {
    const result = await activateApprovedLoan({}, formData(true));
    expect(result.error).toMatch(/foto del recibo firmado/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("sends the attestation, payment and delivery evidence to the authorized RPC", async () => {
    const form = formData(true);
    form.set("paymentEvidence", new File([new Uint8Array(await sharp({ create: { width: 10, height: 10, channels: 3, background: "white" } }).png().toBuffer())], "recibo.png", { type: "image/png" }));
    form.set("signedReceiptAttested", "on");
    await expect(activateApprovedLoan({}, form)).rejects.toThrow(`NEXT_REDIRECT:/solicitudes/${ids.applicationId}?estado=activada`);

    expect(getTenantAccess).toHaveBeenNthCalledWith(1, "financing.approve");
    expect(getTenantAccess).toHaveBeenNthCalledWith(2, "payments.record");
    expect(rpc).toHaveBeenCalledWith("activate_approved_loan_with_evidence", {
      p_loan_id: ids.loanId,
      p_payment_method: "cash",
      p_reference: "RECIBO-PRUEBA-01",
      p_idempotency_key: ids.idempotencyKey,
      p_signed_document_path: "expediente/contrato-ficticio-01",
      p_contract_evidence_attested: true,
      p_delivery_date: "2026-10-20",
      p_evidence_image: expect.stringMatching(/^\\x52494646/),
      p_signed_receipt_attested: true,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/cobros");
  });
});
