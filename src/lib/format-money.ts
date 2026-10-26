const wholePesos = new Intl.NumberFormat("es-DO", { maximumFractionDigits: 0 });

export function decimalToCents(value: string | number) {
  const normalized = typeof value === "string"
    ? value.trim()
    : Number.isFinite(value) ? String(value) : "";
  if (!/^-?(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/.test(normalized)) {
    throw new Error("Importe DOP inválido.");
  }
  const negative = normalized.startsWith("-");
  const unsigned = negative ? normalized.slice(1) : normalized;
  const [whole, fraction = ""] = unsigned.split(".");
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  return negative ? -cents : cents;
}

export function formatDopCents(cents: bigint) {
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  const whole = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, "0");
  return `${negative ? "−" : ""}RD$${wholePesos.format(whole)}.${fraction}`;
}

export function centsToDecimal(cents: bigint) {
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  const whole = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

export function formatDop(value: string | number) {
  return formatDopCents(decimalToCents(value));
}
