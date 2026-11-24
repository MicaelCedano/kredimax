import { describe, expect, it } from "vitest";
import { DEMO_PORTAL_SNAPSHOT, getDemoAuthorizedReceipt } from "../src/demo/demo-data";
import {
  buildExecutiveWhatsAppPaymentUrl,
  formatCedulaInput,
  formatDominicanDate,
  formatDopCurrency,
  maskCedulaForDisplay,
  normalizeCedulaDigits,
  normalizeWhatsappPhone,
  validatePasswordAgainstCedula,
} from "../src/utils/formatters";
import {
  fetchAuthorizedReceipt,
  fetchCustomerPortalSnapshot,
  loginWithCedulaAndPassword,
} from "../src/services/api-client";

describe("KrediMax Clientes Mobile — DEMO Mode Data & Financial Parity", () => {
  it("provides the exact required DEMO specification for Juan Pérez and Samsung Galaxy A55", () => {
    expect(DEMO_PORTAL_SNAPSHOT.mode).toBe("DEMO");
    expect(DEMO_PORTAL_SNAPSHOT.customer.fullName).toBe("Juan Pérez");
    expect(DEMO_PORTAL_SNAPSHOT.customer.maskedCedula).toBe("***-****890-1");

    const mainLoan = DEMO_PORTAL_SNAPSHOT.loans[0];
    expect(mainLoan).toBeDefined();
    expect(mainLoan.device.brand).toBe("Samsung");
    expect(mainLoan.device.model).toContain("Galaxy A55");
    expect(mainLoan.totalFinancedFormatted).toBe("RD$30,000.00");
    expect(mainLoan.totalPaidFormatted).toBe("RD$12,000.00");
    expect(mainLoan.pendingBalanceFormatted).toBe("RD$18,000.00");
    expect(mainLoan.progressPercent).toBe(40);
    expect(mainLoan.nextInstallment?.amountDueFormatted).toBe("RD$2,500.00");
  });

  it("ensures installment schedule sums match the loan summary without discrepancy", () => {
    const mainLoan = DEMO_PORTAL_SNAPSHOT.loans[0];
    const loanInstallments = DEMO_PORTAL_SNAPSHOT.installments.filter(
      (i) => i.loanId === mainLoan.id,
    );

    expect(loanInstallments.length).toBe(12);

    const totalDue = loanInstallments.reduce((acc, i) => acc + Number(i.amountDue), 0);
    const totalPaid = loanInstallments.reduce((acc, i) => acc + Number(i.amountPaid), 0);
    const totalBalance = loanInstallments.reduce((acc, i) => acc + Number(i.balance), 0);

    expect(totalDue).toBe(30000);
    expect(totalPaid).toBe(12000);
    expect(totalBalance).toBe(18000);

    // Verify all 4 required visual states exist in the schedule
    const statuses = new Set(loanInstallments.map((i) => i.status));
    expect(statuses.has("paid")).toBe(true);
    expect(statuses.has("partial")).toBe(true);
    expect(statuses.has("overdue")).toBe(true);
    expect(statuses.has("pending")).toBe(true);
  });

  it("returns authorized receipts only for valid confirmed payments", () => {
    const validReceipt = getDemoAuthorizedReceipt("demo-pay-5");
    expect(validReceipt).not.toBeNull();
    expect(validReceipt?.receiptNumber).toBe("REC-2026-00912");
    expect(validReceipt?.customerMaskedCedula).toBe("***-****890-1");

    const invalidReceipt = getDemoAuthorizedReceipt("non-existent-payment");
    expect(invalidReceipt).toBeNull();
  });
});

describe("KrediMax Clientes Mobile — Formatters & Security Policies", () => {
  it("formats Dominican Peso (RD$) amounts accurately", () => {
    expect(formatDopCurrency("30000.00")).toBe("RD$30,000.00");
    expect(formatDopCurrency(18000)).toBe("RD$18,000.00");
    expect(formatDopCurrency(250000n)).toBe("RD$2,500.00");
  });

  it("masks and normalizes Dominican cédulas without exposing full numbers", () => {
    expect(formatCedulaInput("00123458901")).toBe("001-2345890-1");
    expect(normalizeCedulaDigits("001-2345890-1")).toBe("00123458901");
    expect(normalizeCedulaDigits("000-0000000-0")).toBeNull();
    expect(maskCedulaForDisplay("001-2345890-1")).toBe("***-****890-1");
  });

  it("rejects passwords that contain the last 4 digits of the customer's cédula", () => {
    const blocked = validatePasswordAgainstCedula("KrediMax8901!", "***-****890-1");
    expect(blocked.valid).toBe(false);

    const allowed = validatePasswordAgainstCedula("KrediMax#2026Segura", "***-****890-1");
    expect(allowed).toEqual({ valid: true });
  });

  it("formats dates in America/Santo_Domingo timezone", () => {
    const formatted = formatDominicanDate("2026-04-15", "medium");
    expect(formatted.length).toBeGreaterThan(4);
  });

  it("builds WhatsApp payment redirect URL directed to the assigned sales executive", () => {
    expect(normalizeWhatsappPhone("809-555-0188")).toBe("18095550188");
    const url = buildExecutiveWhatsAppPaymentUrl({
      executiveName: "Carlos Méndez",
      executiveWhatsapp: "809-555-0188",
      customerName: "Juan Pérez",
      maskedCedula: "***-****890-1",
      contractNumber: "KM-2026-0148",
      deviceLabel: "Samsung Galaxy A55 5G",
      installmentSequence: 5,
      dueDateFormatted: "15 abr 2026",
      amountFormatted: "RD$500.00",
    });
    expect(url).toContain("https://wa.me/18095550188?text=");
    const decoded = decodeURIComponent(url.split("?text=")[1]);
    expect(decoded).toContain("Carlos Méndez");
    expect(decoded).toContain("Juan Pérez");
    expect(decoded).toContain("KM-2026-0148");
    expect(decoded).toContain("Cuota #5");
    expect(decoded).toContain("RD$500.00");
  });
});

describe("KrediMax Clientes Mobile — Service Isolation & Auth Flows", () => {
  it("isolates DEMO session snapshot from production API calls", async () => {
    const loginRes = await loginWithCedulaAndPassword({
      cedula: "001-2345890-1",
      password: "DemoPassword123",
      allowDemoFallback: true,
    });
    expect(loginRes.ok).toBe(true);
    if (!loginRes.ok) return;

    expect(loginRes.session.mode).toBe("DEMO");
    expect(loginRes.session.maskedCedula).toBe("***-****890-1");

    const snapshot = await fetchCustomerPortalSnapshot(loginRes.session);
    expect(snapshot.mode).toBe("DEMO");
    expect(snapshot.customer.fullName).toBe("Juan Pérez");

    const receipt = await fetchAuthorizedReceipt(loginRes.session, "demo-pay-4");
    expect(receipt.receiptNumber).toBe("REC-2026-00741");
  });

  it("enforces mandatory password change on first login when temporary password is used", async () => {
    const tempLogin = await loginWithCedulaAndPassword({
      cedula: "001-2345890-1",
      password: "TempKredi#2026",
      allowDemoFallback: true,
    });
    expect(tempLogin.ok).toBe(true);
    if (tempLogin.ok) {
      expect(tempLogin.session.mustChangePassword).toBe(true);
    }
  });
});
