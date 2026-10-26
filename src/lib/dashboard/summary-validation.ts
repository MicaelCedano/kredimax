const moneyPattern = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
const monthPattern = /^\d{4}-(?:0[1-9]|1[0-2])$/;

function isCount(value: unknown) {
  return (typeof value === "number" && Number.isSafeInteger(value) && value >= 0)
    || (typeof value === "string" && /^\d+$/.test(value));
}

function isMoney(value: unknown) {
  return typeof value === "string" && moneyPattern.test(value);
}

export function isDashboardSummary(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const summary = value as Record<string, unknown>;
  const requiredCounts = ["customers", "devices", "applications", "activeLoans", "overdueInstallments"];
  const requiredMoney = ["activeBalance", "allTimePaymentsReceived", "overdueBalance"];
  if (!requiredCounts.every((key) => isCount(summary[key]))
      || !requiredMoney.every((key) => isMoney(summary[key]))
      || typeof summary.collectionRate !== "number"
      || !Number.isFinite(summary.collectionRate)
      || summary.collectionRate < 0
      || summary.collectionRate > 100
      || !Array.isArray(summary.chart)
      || !Array.isArray(summary.upcoming)
      || !Array.isArray(summary.recent)) return false;

  return summary.chart.every((row) => row && typeof row === "object"
      && typeof row.month === "string" && monthPattern.test(row.month)
      && isMoney(row.amount))
    && summary.upcoming.every((row) => row && typeof row === "object"
      && typeof row.customer === "string" && typeof row.device === "string"
      && typeof row.dueDate === "string" && isMoney(row.amount)
      && typeof row.status === "string")
    && summary.recent.every((row) => row && typeof row === "object"
      && typeof row.title === "string" && typeof row.detail === "string"
      && typeof row.date === "string"
      && (row.amount === null || isMoney(row.amount)));
}
