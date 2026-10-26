import { describe, expect, it } from "vitest";
import { isDashboardSummary } from "../src/lib/dashboard/summary-validation";

const validSummary = {
  customers: 2,
  devices: 3,
  applications: 1,
  activeLoans: 1,
  activeBalance: "25.00",
  allTimePaymentsReceived: "5.00",
  overdueInstallments: 0,
  overdueBalance: "0",
  collectionRate: 100,
  chart: [{ month: "2026-10", amount: "5.00" }],
  upcoming: [{ customer: "Cliente de prueba", device: "Teléfono de prueba", dueDate: "2026-10-22", amount: "10.00", status: "pending" }],
  recent: [{ title: "Pago registrado", detail: "Cliente de prueba", date: "2026-10-20T15:00:00Z", amount: "5.00" }],
};

describe("dashboard summary validation", () => {
  it("accepts complete exact-decimal summaries, including real zero balances", () => {
    expect(isDashboardSummary(validSummary)).toBe(true);
  });

  it("rejects missing or malformed aggregate fields instead of coercing them to zero", () => {
    expect(isDashboardSummary({ ...validSummary, overdueBalance: undefined })).toBe(false);
    expect(isDashboardSummary({ ...validSummary, activeBalance: "NaN" })).toBe(false);
    expect(isDashboardSummary({ ...validSummary, chart: [{ month: "2026-13", amount: "5" }] })).toBe(false);
  });
});
