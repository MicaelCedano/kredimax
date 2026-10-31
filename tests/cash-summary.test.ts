import { describe, expect, it } from "vitest";
import { cashGroupStatus, compareCashDeclaration, groupCashRows, hasCashDifference, summarizeCashRows } from "@/modules/cash/summary";
import type { CashRow } from "@/modules/cash/types";

function row(overrides: Partial<CashRow> = {}): CashRow {
  return { sellerId: "seller-1", sellerName: "Vendedor 1", branchId: "branch-1", branchName: "Sucursal 1", type: "down_payment",
    cash: "3300.00", transfer: "3600.00", other: "0.00", movements: 2, closing: null, ...overrides };
}
function closed(overrides: Partial<CashRow> = {}) {
  return row({ closing: { id: "close", cash: "3300.00", transfer: "3600.00", other: "0.00", expectedCash: "3300.00", expectedTransfer: "3600.00", expectedOther: "0.00", difference: "0.00", notes: null, closedAt: "2026-10-26T12:00:00Z", closedBy: "admin" }, ...overrides });
}

describe("cash reconciliation presentation", () => {
  it("groups both types under each seller without merging branches", () => {
    const groups = groupCashRows([row(), row({ type: "installment" }), row({ branchId: "branch-2" }), row({ sellerId: "seller-2" })]);
    expect(groups.map(group => group.rows.length)).toEqual([2, 1, 1]);
    expect(new Set(groups.map(group => group.key)).size).toBe(3);
  });
  it("keeps exact totals for mixed collection types and compensating reversals", () => {
    const summary = summarizeCashRows([row(), row({ type: "installment", cash: "-50.25", transfer: "0.00", other: "10.10" })]);
    expect(summary.total).toBe(685985n);
    expect(summary.byType).toEqual({ down_payment: 690000n, installment: -4015n });
    expect(summary.byMethod).toEqual({ cash: 324975n, transfer: 360000n, other: 1010n });
  });
  it("a partial close advances progress without marking the seller complete", () => {
    const rows = [closed(), row({ type: "installment" })];
    const summary = summarizeCashRows(rows);
    expect(summary.closedCount).toBe(1); expect(summary.pendingCount).toBe(1);
    expect(summary.progress).toBe(50); expect(summary.completedSellers).toBe(0);
    expect(summary.declared).toBe(690000n);
    expect(cashGroupStatus(rows)).toEqual({ tone: "warning", label: "Falta cerrar cuotas" });
  });
  it("detects differences by method even when they cancel in the net total", () => {
    const base = closed();
    const mismatch = row({ closing: { ...base.closing!, cash: "3200.00", transfer: "3700.00" } });
    expect(hasCashDifference(mismatch)).toBe(true);
    const summary = summarizeCashRows([mismatch]);
    expect(summary.difference).toBe(0n); expect(summary.differenceCount).toBe(1);
    expect(cashGroupStatus([mismatch]).tone).toBe("danger");
  });
  it("uses the saved expected values to assess a saved close", () => {
    const saved = closed({ cash: "9999.00" });
    expect(hasCashDifference(saved)).toBe(false);
    expect(cashGroupStatus([saved])).toEqual({ tone: "success", label: "Cuadrada" });
  });
  it("an empty report does not show completed sellers or divide by zero", () => {
    const summary = summarizeCashRows([]);
    expect(summary.progress).toBe(0); expect(summary.completedSellers).toBe(0); expect(summary.sellerCount).toBe(0);
  });
  it("a seller is complete only when all of their visible branch drawers are closed", () => {
    const summary = summarizeCashRows([closed(), closed({ type: "installment" }), row({ branchId: "branch-2" })]);
    expect(summary.sellerCount).toBe(1); expect(summary.completedSellers).toBe(0);
  });
  it("does not treat blank or malformed count fields as zero", () => {
    for (const value of ["", "NaN", "1e3", "1.001"]) {
      const comparison = compareCashDeclaration(row(), { cash: value, transfer: "3600", other: "0" });
      expect(comparison.complete).toBe(false); expect(comparison.total).toBeNull(); expect(comparison.differences.cash).toBeNull();
    }
  });
  it("compares valid amounts without floating point rounding and identifies offsetting differences", () => {
    const comparison = compareCashDeclaration(row(), { cash: "3299.99", transfer: "3600.01", other: "0" });
    expect(comparison.complete).toBe(true); expect(comparison.difference).toBe(0n);
    expect(comparison.hasDifferences).toBe(true); expect(comparison.differences).toEqual({ cash: -1n, transfer: 1n, other: 0n });
    expect(compareCashDeclaration(row(), { cash: "3300", transfer: "3600", other: "0" }).hasDifferences).toBe(false);
  });
});
