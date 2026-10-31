import { decimalToCents } from "@/lib/format-money";
import type { CashRow } from "@/modules/cash/types";

export const CASH_METHODS = ["cash", "transfer", "other"] as const;
export type CashMethod = typeof CASH_METHODS[number];
export const CASH_METHOD_LABELS = { cash: "Efectivo", transfer: "Transferencias", other: "Otros" };
export const CASH_TYPE_LABELS = { down_payment: "Iniciales", installment: "Cuotas" };
const expectedKeys = { cash: "expectedCash", transfer: "expectedTransfer", other: "expectedOther" } as const;

export function cashRowTotal(row: CashRow) {
  return CASH_METHODS.reduce((sum, method) => sum + decimalToCents(row[method]), 0n);
}

export function cashExpected(row: CashRow, method: CashMethod) {
  return decimalToCents(row.closing ? row.closing[expectedKeys[method]] : row[method]);
}

export function hasCashDifference(row: CashRow) {
  return Boolean(row.closing && CASH_METHODS.some(method => decimalToCents(row.closing![method]) !== cashExpected(row, method)));
}

export type SellerCashGroup = { key: string; sellerId: string; sellerName: string; branchName: string | null; rows: CashRow[] };
export function groupCashRows(rows: CashRow[]): SellerCashGroup[] {
  const groups = new Map<string, SellerCashGroup>();
  for (const row of rows) {
    const key = `${row.sellerId}:${row.branchId ?? "unassigned"}`;
    const group = groups.get(key);
    if (group) group.rows.push(row);
    else groups.set(key, { key, sellerId: row.sellerId, sellerName: row.sellerName, branchName: row.branchName, rows: [row] });
  }
  return [...groups.values()];
}

export function cashGroupStatus(rows: CashRow[]) {
  if (rows.some(hasCashDifference)) return { tone: "danger", label: "Con diferencia" } as const;
  if (rows.length && rows.every(row => row.closing)) return { tone: "success", label: "Cuadrada" } as const;
  if (rows.some(row => row.closing)) {
    const remaining = rows.filter(row => !row.closing);
    return { tone: "warning", label: remaining.length === 1 ? `Falta cerrar ${CASH_TYPE_LABELS[remaining[0].type].toLowerCase()}` : "Cierre incompleto" } as const;
  }
  return { tone: "warning", label: "Por cuadrar" } as const;
}

export function summarizeCashRows(rows: CashRow[]) {
  const sellers = new Map<string, CashRow[]>();
  for (const row of rows) sellers.set(row.sellerId, [...(sellers.get(row.sellerId) ?? []), row]);
  const closed = rows.filter(row => row.closing);
  return {
    total: rows.reduce((sum, row) => sum + cashRowTotal(row), 0n),
    byMethod: Object.fromEntries(CASH_METHODS.map(method => [method, rows.reduce((sum, row) => sum + decimalToCents(row[method]), 0n)])) as Record<CashMethod, bigint>,
    byType: {
      down_payment: rows.filter(row => row.type === "down_payment").reduce((sum, row) => sum + cashRowTotal(row), 0n),
      installment: rows.filter(row => row.type === "installment").reduce((sum, row) => sum + cashRowTotal(row), 0n),
    },
    sellerCount: sellers.size,
    completedSellers: [...sellers.values()].filter(sellerRows => sellerRows.every(row => row.closing)).length,
    closedCount: closed.length,
    pendingCount: rows.length - closed.length,
    differenceCount: closed.filter(hasCashDifference).length,
    progress: rows.length ? Math.round(closed.length / rows.length * 100) : 0,
    declared: closed.reduce((sum, row) => sum + CASH_METHODS.reduce((subtotal, method) => subtotal + decimalToCents(row.closing![method]), 0n), 0n),
    difference: closed.reduce((sum, row) => sum + CASH_METHODS.reduce((subtotal, method) => subtotal + decimalToCents(row.closing![method]) - cashExpected(row, method), 0n), 0n),
  };
}

export function compareCashDeclaration(row: CashRow, values: Record<CashMethod, string>) {
  const amounts = {} as Record<CashMethod, bigint | null>;
  for (const method of CASH_METHODS) {
    try { amounts[method] = decimalToCents(values[method]); }
    catch { amounts[method] = null; }
  }
  const complete = CASH_METHODS.every(method => amounts[method] !== null);
  const differences = Object.fromEntries(CASH_METHODS.map(method => [method, amounts[method] === null ? null : amounts[method]! - cashExpected(row, method)])) as Record<CashMethod, bigint | null>;
  return {
    complete,
    differences,
    hasDifferences: CASH_METHODS.some(method => differences[method] !== null && differences[method] !== 0n),
    total: complete ? CASH_METHODS.reduce((sum, method) => sum + amounts[method]!, 0n) : null,
    difference: complete ? CASH_METHODS.reduce((sum, method) => sum + differences[method]!, 0n) : null,
  };
}
