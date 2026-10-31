import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getTenantAccess: vi.fn(), loadHandoverContext: vi.fn(), notFound: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/security/tenant-access", () => ({ getTenantAccess: mocks.getTenantAccess }));
vi.mock("@/modules/financing/handover-context.server", () => ({ loadHandoverContext: mocks.loadHandoverContext }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound, redirect: mocks.redirect }));
import ProvisionalActPage from "../src/app/solicitudes/[id]/acta/page";

describe("provisional handover document", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getTenantAccess.mockResolvedValue({ ok: true, membership: { tenant_id: "tenant-a" } });
    mocks.notFound.mockImplementation(() => { throw new Error("NOT_FOUND"); });
    mocks.redirect.mockImplementation(() => { throw new Error("LOGIN_REDIRECT"); });
    mocks.loadHandoverContext.mockResolvedValue({ company: "Empresa DEMO", customer: { full_name: "Cliente DEMO", identity_number: "DEMO-001", phone: "8095550101", address: "Calle de prueba", home_location: null, reference_name: null, reference_phone: null }, loan: { sale_price: "10000.00", down_payment: "3000.00", principal: "7000.00" }, contract: { contract_number: "KM-DEMO" }, quote: { device: { brand: "Equipo DEMO", model: "Modelo de prueba" }, installmentCount: 6, fixedInstallment: "1500.00", frequency: "monthly" } });
  });
  it("clearly marks the example as provisional and exposes no signing or activation form", async () => {
    const markup = renderToStaticMarkup(await ProvisionalActPage({ params: Promise.resolve({ id: "21000000-0000-4000-8000-000000000001" }) }));
    expect(markup).toContain("BORRADOR PROVISIONAL · NO FIRMAR");
    expect(markup).toContain("[POR COMPLETAR]");
    expect(markup).toContain("SIN FIRMAS NI CERTIFICACIÓN NOTARIAL");
    expect(markup).toContain("KM-DEMO");
    expect(markup).not.toContain("<form");
    expect(markup).not.toContain("contractEvidenceAttested");
  });
  it("does not expose customer data to a user without financing read access", async () => {
    mocks.getTenantAccess.mockResolvedValue({ ok: false, reason: "forbidden" });
    await expect(ProvisionalActPage({ params: Promise.resolve({ id: "private-id" }) })).rejects.toThrow("NOT_FOUND");
    expect(mocks.loadHandoverContext).not.toHaveBeenCalled();
  });
  it("does not label a schedule with variable installments as a fixed contractual payment", async () => {
    const context = await mocks.loadHandoverContext();
    mocks.loadHandoverContext.mockResolvedValue({ ...context, quote: { ...context.quote, schedule: [{ sequence: 1, dueDate: "2026-11-01", amount: "1500.00" }, { sequence: 2, dueDate: "2026-12-01", amount: "1300.00" }] } });
    const markup = renderToStaticMarkup(await ProvisionalActPage({ params: Promise.resolve({ id: "21000000-0000-4000-8000-000000000001" }) }));
    expect(markup).not.toContain("Cuota contractual:");
    expect(markup).toContain("Cuota 1");
    expect(markup).toContain("Cuota 2");
  });
});
