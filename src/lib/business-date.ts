export const BUSINESS_TIME_ZONE = "America/Santo_Domingo";

export function isoDateInTimeZone(value: Date, timeZone = BUSINESS_TIME_ZONE) {
  if (!Number.isFinite(value.getTime())) throw new Error("Fecha inválida.");
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    year: "numeric", month: "2-digit", day: "2-digit", timeZone,
  }).formatToParts(value).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function parseIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Fecha ISO inválida.");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error("Fecha ISO inválida.");
  }
  return date;
}

export function addIsoCalendarDays(value: string, days: number) {
  if (!Number.isSafeInteger(days)) throw new Error("Cantidad de días inválida.");
  const date = parseIsoDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function dateOnlyValue(value: string) {
  const date = parseIsoDate(value);
  date.setUTCHours(12);
  return date;
}
