import { decimalToCents } from "./format-money";

export type InstallmentAmount = { sequence: number; amount_due: string | number };
export type ContractInstallmentBreakdown = {
  principal: bigint;
  interest: bigint;
  legalExpenses: bigint;
  adjustment: bigint;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function cents(value: unknown): bigint | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  try { return decimalToCents(value); } catch { return null; }
}

/** Shows contractual components only when every snapshot row matches its stored installment total. */
export function getContractBreakdownBySequence(
  terms: unknown,
  installments: InstallmentAmount[],
): Map<number, ContractInstallmentBreakdown> {
  const result = new Map<number, ContractInstallmentBreakdown>();
  if (installments.length === 0) return result;

  const termsRecord = asRecord(terms);
  if (!termsRecord || !Array.isArray(termsRecord.schedule) || termsRecord.schedule.length !== installments.length) return result;

  const installmentAmounts = new Map<number, bigint>();
  for (const installment of installments) {
    if (!Number.isSafeInteger(installment.sequence) || installment.sequence <= 0 || installmentAmounts.has(installment.sequence)) return new Map();
    const amount = cents(installment.amount_due);
    if (amount === null || amount < 0n) return new Map();
    installmentAmounts.set(installment.sequence, amount);
  }

  for (const rawRow of termsRecord.schedule) {
    const row = asRecord(rawRow);
    const sequence = row?.sequence;
    if (typeof sequence !== "number" || !Number.isSafeInteger(sequence) || sequence <= 0 || result.has(sequence)) return new Map();

    const amount = cents(row?.amount);
    const principal = cents(row?.principal);
    const interest = cents(row?.interest);
    const legalExpenses = cents(row?.legalExpenses);
    const adjustment = cents(row?.proposedAdjustment);
    const installmentAmount = installmentAmounts.get(sequence);
    if ([amount, principal, interest, legalExpenses, adjustment, installmentAmount].some((value) => value === undefined || value === null || value < 0n)) return new Map();

    const componentTotal = principal! + interest! + legalExpenses! + adjustment!;
    if (amount !== installmentAmount || componentTotal !== amount) return new Map();
    result.set(sequence, { principal: principal!, interest: interest!, legalExpenses: legalExpenses!, adjustment: adjustment! });
  }

  return result.size === installments.length ? result : new Map();
}
