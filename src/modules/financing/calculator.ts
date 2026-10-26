import { NEW_FINANCING_TERMS } from "@/modules/financing/term-policy";

export const DEFAULT_FINANCING_SETTINGS = {
  downPaymentPercent: "30.00",
  annualRatePercent: "48.000",
  legalExpenses: "1000.00",
  allowedTerms: NEW_FINANCING_TERMS,
  recoveryTargetPercent: "100.00",
  recoveryEnabled: false,
} as const;

export const DOWN_PAYMENT_PERCENT_OPTIONS = ["30.00", "35.00", "40.00", "45.00", "50.00"] as const;

export function downPaymentOptions(configuredPercent: string) {
  const configuredBps = parseRateToBasisPoints(configuredPercent);
  if (configuredBps <= 0n || configuredBps > 10000n) throw new Error("Revisa el porcentaje de inicial configurado.");
  const options: string[] = [...DOWN_PAYMENT_PERCENT_OPTIONS];
  if (!options.some((option) => parseRateToBasisPoints(option) === configuredBps)) options.push(configuredPercent);
  return options.sort((a, b) => Number(a) - Number(b));
}

export function resolveDownPaymentPercent(selectedPercent: string, configuredPercent: string) {
  const selectedBps = parseRateToBasisPoints(selectedPercent || configuredPercent);
  const selected = downPaymentOptions(configuredPercent).find((option) => parseRateToBasisPoints(option) === selectedBps);
  if (!selected) throw new Error("Selecciona un inicial de 30%, 35%, 40%, 45% o 50%.");
  return selected;
}

export function resolveRecoveryEnabled(value: unknown) {
  return typeof value === "boolean" ? value : DEFAULT_FINANCING_SETTINGS.recoveryEnabled;
}

export function hasAdvisoryRecovery(policy?: string) {
  return policy === "level_v1" || policy === "balanced_20_v1";
}

export type FinancingSettings = {
  downPaymentPercent: string;
  annualRatePercent: string;
  legalExpenses: string;
  allowedTerms: number[];
  recoveryTargetPercent: string;
  recoveryEnabled: boolean;
};

export type InstallmentQuote = {
  sequence: number;
  dueDate: string;
  amount: string;
  principal: string;
  interest: string;
  legalExpenses: string;
  proposedAdjustment: string;
};

export type FinancingQuote = {
  paymentDistribution: "level_v1" | "frontloaded_v1" | "balanced_20_v1";
  recoveryMaximumDifferencePercent?: string;
  recoveryAtSixMonths: string;
  installmentRounding: "up_50" | "cent";
  roundingAdjustment: string;
  currency: "DOP";
  salePrice: string;
  deviceCost: string;
  downPaymentPercent: string;
  downPayment: string;
  principal: string;
  annualRatePercent: string;
  baseInterest: string;
  legalExpenses: string;
  termMonths: number;
  frequency: "monthly" | "fortnightly";
  installmentCount: number;
  baseInstallment: string;
  recoveryInstallment: string;
  fixedInstallment: string;
  proposedAdjustment: string;
  totalCustomerPays: string;
  recoveryAtHalf: string;
  recoveryTarget: string;
  recoveryEnabled: boolean;
  recoveryDifference: string;
  recoveryMet: boolean;
  adjustmentRequiresApproval: boolean;
  firstInstallmentDate: string;
  finalDueDate: string;
  schedule: InstallmentQuote[];
};

const MONEY_PATTERN = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/;

export function parseMoneyToCents(value: string) {
  const normalized = value.trim();
  if (!MONEY_PATTERN.test(normalized)) throw new Error("Escribe un monto con hasta dos decimales.");
  const [whole, fraction = ""] = normalized.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}

function parseRateToBasisPoints(value: string) {
  const normalized = value.trim();
  if (!/^(?:0|[1-9]\d{0,2})(?:\.\d{1,3})?$/.test(normalized)) throw new Error("El porcentaje debe tener hasta dos decimales.");
  const [whole, fraction = ""] = normalized.split(".");
  if (fraction.length > 2 && fraction.slice(2).replaceAll("0", "")) throw new Error("El porcentaje debe tener hasta dos decimales.");
  return BigInt(whole) * 100n + BigInt(fraction.slice(0, 2).padEnd(2, "0"));
}

function roundHalfUp(numerator: bigint, denominator: bigint) {
  return (numerator + denominator / 2n) / denominator;
}

function ceilDiv(numerator: bigint, denominator: bigint) {
  return (numerator + denominator - 1n) / denominator;
}

function centsToMoney(cents: bigint) {
  const absolute = cents < 0n ? -cents : cents;
  const formatted = `${absolute / 100n}.${(absolute % 100n).toString().padStart(2, "0")}`;
  return cents < 0n ? `-${formatted}` : formatted;
}

function addCalendarMonths(date: Date, months: number) {
  const result = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return result.toISOString().slice(0, 10);
}

function addDays(isoDate: string, days: number) {
  const result = new Date(`${isoDate}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

function distributeCents(total: bigint, count: number) {
  const amount = total / BigInt(count);
  const remainder = total % BigInt(count);
  return Array.from({ length: count }, (_, index) => amount + (BigInt(index) < remainder ? 1n : 0n));
}

export function calculateFinancingQuote(input: {
  salePrice: string;
  deviceCost: string;
  downPaymentPercent: string;
  annualRatePercent: string;
  legalExpenses: string;
  termMonths: number;
  frequency: "monthly" | "fortnightly";
  firstInstallmentDate: string;
  today?: string;
  recoveryTargetPercent?: string;
  recoveryEnabled?: boolean;
  /** Use cent only to reproduce a historical quote; new applications use up_50. */
  installmentRounding?: "up_50" | "cent";
  /** Legacy policy is available only to reproduce existing snapshots. */
  paymentDistribution?: "level_v1" | "frontloaded_v1" | "balanced_20_v1";
}): FinancingQuote {
  const salePrice = parseMoneyToCents(input.salePrice);
  const deviceCost = parseMoneyToCents(input.deviceCost);
  const legalExpenses = parseMoneyToCents(input.legalExpenses);
  const downPaymentBps = parseRateToBasisPoints(input.downPaymentPercent);
  const annualRateBps = parseRateToBasisPoints(input.annualRatePercent);
  const recoveryTargetBps = parseRateToBasisPoints(input.recoveryTargetPercent ?? "100");
  const recoveryEnabled = input.recoveryEnabled ?? DEFAULT_FINANCING_SETTINGS.recoveryEnabled;
  const paymentDistribution = input.paymentDistribution ?? "balanced_20_v1";
  const levelPayments = paymentDistribution === "level_v1";
  const balancedPayments = paymentDistribution === "balanced_20_v1";
  const installmentRounding = input.installmentRounding ?? "up_50";
  const roundInstallment = (amount: bigint) => installmentRounding === "up_50" ? ceilDiv(amount, 5000n) * 5000n : amount;
  if (salePrice <= 0n || deviceCost <= 0n) throw new Error("El precio y el costo del equipo deben ser mayores que cero.");
  if (downPaymentBps <= 0n || downPaymentBps > 10000n) throw new Error("El inicial debe estar entre 0.01% y 100%.");
  if (annualRateBps > 100000n || legalExpenses < 0n) throw new Error("Revisa la tasa anual y los gastos legales.");
  if (![3, 5, 6, 8, 12, 18, 24].includes(input.termMonths)) throw new Error("El plazo seleccionado no está permitido.");
  const firstDate = new Date(`${input.firstInstallmentDate}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.firstInstallmentDate)
      || Number.isNaN(firstDate.valueOf())
      || firstDate.toISOString().slice(0, 10) !== input.firstInstallmentDate
      || input.firstInstallmentDate < (input.today ?? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santo_Domingo" }).format(new Date()))) {
    throw new Error("La primera cuota debe tener una fecha válida y no vencida.");
  }

  const downPayment = roundHalfUp(salePrice * downPaymentBps, 10000n);
  const principal = salePrice - downPayment;
  const baseInterest = roundHalfUp(principal * annualRateBps * BigInt(input.termMonths), 10000n * 12n);
  const installmentCount = input.termMonths * (input.frequency === "fortnightly" ? 2 : 1);
  const baseInstallment = ceilDiv(principal + baseInterest + legalExpenses, BigInt(installmentCount));
  const recoveryPayments = Math.floor(installmentCount / 2);
  const sixMonthPayments = Math.min(installmentCount, 6 * (input.frequency === "fortnightly" ? 2 : 1));
  const recoveryTarget = roundHalfUp(deviceCost * recoveryTargetBps, 10000n);
  const recoveryInstallment = levelPayments
    ? recoveryTarget > downPayment ? ceilDiv(recoveryTarget - downPayment, BigInt(sixMonthPayments)) : 0n
    : !recoveryEnabled ? ceilDiv(principal * 2n, BigInt(installmentCount))
    : recoveryTarget > downPayment ? ceilDiv(recoveryTarget - downPayment, BigInt(recoveryPayments)) : 0n;
  // Recovery changes timing only. Keep the disabled plan's total, including its cent rounding.
  const scheduledTotal = baseInstallment * BigInt(installmentCount);
  const laterPayments = installmentCount - recoveryPayments;
  // Leave at least one cent for each remaining promissory note; an impossible target stays blocked.
  const maximumEarlyInstallment = (scheduledTotal - BigInt(laterPayments)) / BigInt(recoveryPayments);
  const earlyInstallment = recoveryInstallment < maximumEarlyInstallment ? recoveryInstallment : maximumEarlyInstallment;
  const rawFixedInstallment = !levelPayments && !balancedPayments && recoveryEnabled && earlyInstallment > baseInstallment ? earlyInstallment : baseInstallment;
  let amounts = [
    ...Array<bigint>(recoveryPayments).fill(rawFixedInstallment),
    ...distributeCents(scheduledTotal - rawFixedInstallment * BigInt(recoveryPayments), laterPayments),
  ].map(roundInstallment);
  if (balancedPayments) {
    // Redistribute whole RD$50 units; keep the level plan's exact total.
    const baseUnits = ceilDiv(baseInstallment, 5000n);
    const totalUnits = baseUnits * BigInt(installmentCount);
    const earlyCount = BigInt(recoveryPayments), lateCount = BigInt(laterPayments);
    let earlyUnits = baseUnits;
    if (recoveryEnabled) {
      let maximumUnits = (6n * totalUnits) / (5n * lateCount + 6n * earlyCount);
      // The cap also holds against the smallest later installment after distribution.
      while (maximumUnits > baseUnits && maximumUnits * 5n > 6n * ((totalUnits - maximumUnits * earlyCount) / lateCount)) maximumUnits -= 1n;
      const targetUnits = recoveryTarget > downPayment ? ceilDiv(recoveryTarget - downPayment, earlyCount * 5000n) : 0n;
      const desiredUnits = targetUnits < maximumUnits ? targetUnits : maximumUnits;
      if (desiredUnits > earlyUnits) earlyUnits = desiredUnits;
    }
    amounts = [
      ...Array<bigint>(recoveryPayments).fill(earlyUnits * 5000n),
      ...distributeCents(totalUnits - earlyUnits * earlyCount, laterPayments).map((units) => units * 5000n),
    ];
  }
  const roundedScheduledTotal = amounts.reduce((sum, amount) => sum + amount, 0n);
  const fixedInstallment = amounts[0];
  const totalCustomerPays = downPayment + roundedScheduledTotal;
  const recoveryAtHalf = downPayment + amounts.slice(0, recoveryPayments).reduce((sum, amount) => sum + amount, 0n);
  const recoveryAtSixMonths = downPayment + amounts.slice(0, sixMonthPayments).reduce((sum, amount) => sum + amount, 0n);
  const proposedAdjustment = totalCustomerPays > salePrice + baseInterest + legalExpenses
    ? totalCustomerPays - salePrice - baseInterest - legalExpenses
    : 0n;

  const principalParts = distributeCents(principal, installmentCount);
  const interestParts = distributeCents(baseInterest, installmentCount);
  const legalParts = distributeCents(legalExpenses, installmentCount);
  const componentParts = [legalParts, interestParts, principalParts];
  const scheduledComponents = (index: number) => principalParts[index] + interestParts[index] + legalParts[index];
  for (let source = 0; source < installmentCount; source += 1) {
    while (scheduledComponents(source) > amounts[source]) {
      const destination = Array.from({ length: installmentCount }, (_, index) => index)
        .find((index) => index !== source && scheduledComponents(index) < amounts[index]);
      if (destination === undefined) throw new Error("No se pudo distribuir el cronograma en cuotas fijas.");
      const movablePart = componentParts.find((parts) => parts[source] > 0n);
      if (!movablePart) throw new Error("No se pudo distribuir el cronograma en cuotas fijas.");
      const excess = scheduledComponents(source) - amounts[source];
      const capacity = amounts[destination] - scheduledComponents(destination);
      const transfer = [excess, capacity, movablePart[source]].reduce((a, b) => a < b ? a : b);
      movablePart[source] -= transfer;
      movablePart[destination] += transfer;
    }
  }
  const adjustmentParts = amounts.map((amount, index) => amount - scheduledComponents(index));
  if (adjustmentParts.reduce((total, amount) => total + amount, 0n) !== proposedAdjustment) {
    throw new Error("No se pudo distribuir el ajuste del cronograma.");
  }
  const schedule = Array.from({ length: installmentCount }, (_, index) => {
    const dueDate = input.frequency === "monthly"
      ? addCalendarMonths(new Date(`${input.firstInstallmentDate}T00:00:00.000Z`), index)
      : addDays(input.firstInstallmentDate, index * 15);
    return {
      sequence: index + 1,
      dueDate,
      amount: centsToMoney(amounts[index]),
      principal: centsToMoney(principalParts[index]),
      interest: centsToMoney(interestParts[index]),
      legalExpenses: centsToMoney(legalParts[index]),
      proposedAdjustment: centsToMoney(adjustmentParts[index]),
    };
  });

  return {
    paymentDistribution,
    ...(balancedPayments ? { recoveryMaximumDifferencePercent: "20.00" } : {}),
    recoveryAtSixMonths: centsToMoney(recoveryAtSixMonths),
    installmentRounding,
    roundingAdjustment: centsToMoney(roundedScheduledTotal - scheduledTotal),
    currency: "DOP",
    salePrice: centsToMoney(salePrice),
    deviceCost: centsToMoney(deviceCost),
    downPaymentPercent: input.downPaymentPercent,
    downPayment: centsToMoney(downPayment),
    principal: centsToMoney(principal),
    annualRatePercent: input.annualRatePercent,
    baseInterest: centsToMoney(baseInterest),
    legalExpenses: centsToMoney(legalExpenses),
    termMonths: input.termMonths,
    frequency: input.frequency,
    installmentCount,
    baseInstallment: centsToMoney(roundInstallment(baseInstallment)),
    recoveryInstallment: centsToMoney(roundInstallment(recoveryInstallment)),
    fixedInstallment: centsToMoney(fixedInstallment),
    proposedAdjustment: centsToMoney(proposedAdjustment),
    totalCustomerPays: centsToMoney(totalCustomerPays),
    recoveryAtHalf: centsToMoney(recoveryAtHalf),
    recoveryTarget: centsToMoney(recoveryTarget),
    recoveryEnabled,
    recoveryDifference: centsToMoney((hasAdvisoryRecovery(paymentDistribution) ? recoveryAtSixMonths : recoveryAtHalf) - recoveryTarget),
    recoveryMet: hasAdvisoryRecovery(paymentDistribution) ? recoveryAtSixMonths >= recoveryTarget : !recoveryEnabled || recoveryAtHalf >= recoveryTarget,
    adjustmentRequiresApproval: proposedAdjustment > 0n,
    firstInstallmentDate: input.firstInstallmentDate,
    finalDueDate: schedule.at(-1)?.dueDate ?? input.firstInstallmentDate,
    schedule,
  };
}

export function sumMoney(values: string[]) {
  return centsToMoney(values.reduce((total, value) => total + parseMoneyToCents(value), 0n));
}
