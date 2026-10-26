import { describe, expect, it } from "vitest";
import { paymentExportHeader, paymentExportRows, type PaymentExport } from "../src/lib/reports/payment-detail-csv";

const payment: PaymentExport = {
  id: "payment-1",
  loanId: "loan-1",
  branchId: "branch-1",
  amount: "100000000.29",
  currency: "DOP",
  receivedAt: "2026-10-20T14:00:00+00:00",
  receivedBy: "user-1",
  paymentMethod: "bank_transfer",
  reference: '=HYPERLINK("https://example.test")',
  paymentType: "installment",
  reversedAt: "2026-10-20T15:00:00+00:00",
  reversedBy: "admin-1",
  reversalReason: "Corrección autorizada",
  allocations: [
    { installmentId: "installment-1", amount: "40.10" },
    { installmentId: "installment-2", amount: "59.90" },
  ],
};

describe("payment detail CSV", () => {
  it("keeps a valid header-only export when the selected period has no payments", () => {
    const columns = paymentExportHeader().trimEnd().split(",");
    expect(columns).toHaveLength(16);
    expect(paymentExportRows([])).toEqual([]);
  });

  it("exports one row per allocation, preserves exact decimal strings, and neutralizes spreadsheet formulas", () => {
    const rows = paymentExportRows([payment]);
    expect(paymentExportHeader()).toContain("Pago ID");
    expect(rows).toHaveLength(6);
    expect(rows[0]).toContain('"cobro"');
    expect(rows[0]).toContain('"100000000.29"');
    expect(rows[0]).toContain("'=HYPERLINK(");
    expect(rows[1]).toContain('"asignacion"');
    expect(rows[1]).toContain('"40.10"');
    expect(rows[2]).toContain('"59.90"');
    expect(rows[3]).toContain('"reverso"');
    expect(rows[3]).toContain('"-100000000.29"');
    expect(rows[4]).toContain('"-40.10"');
    expect(rows[5]).toContain('"-59.90"');
  });

  it("keeps payments without installment allocations in the export", () => {
    expect(paymentExportRows([{ ...payment, paymentType: "down_payment", allocations: [], reversedAt: null, reversedBy: null }])).toHaveLength(1);
  });
});
