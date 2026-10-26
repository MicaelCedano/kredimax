export function uppercaseCustomerName(value: string) {
  return value.toLocaleUpperCase("es-DO");
}

export function formatIdentityInput(value: string) {
  if (!/^[\d\s-]*$/.test(value)) return value;
  const digits = value.replace(/\D/g, "");
  if (digits.length > 11) return value;
  return [digits.slice(0, 3), digits.slice(3, 10), digits.slice(10)].filter(Boolean).join("-");
}

export function formatPhoneInput(value: string) {
  if (!/^[+\d\s().-]*$/.test(value)) return value;
  const digits = value.replace(/\D/g, "");
  const hasCountryCode = digits.length === 11 && digits.startsWith("1");
  if (digits.length > 10 && !hasCountryCode) return value;
  if (value.startsWith("+") && !hasCountryCode) return value;
  const local = hasCountryCode ? digits.slice(1) : digits;
  const formatted = [local.slice(0, 3), local.slice(3, 6), local.slice(6)].filter(Boolean).join("-");
  return hasCountryCode ? `${value.startsWith("+") ? "+" : ""}1-${formatted}` : formatted;
}

export function formatMoneyInput(value: string, completeDecimals = false) {
  const plain = value.replaceAll(",", "");
  if (!plain) return "";
  if (!/^\d{0,12}(?:\.\d{0,2})?$/.test(plain)) return value;
  const [whole, fraction] = plain.split(".");
  const grouped = whole.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (completeDecimals) return `${grouped || "0"}.${(fraction ?? "").padEnd(2, "0")}`;
  return fraction === undefined ? grouped : `${grouped || "0"}.${fraction}`;
}

// Accept only proper thousands grouping at the server boundary; don't turn "1,2" into 12 pesos.
export function normalizeMoneyInput(value: string) {
  const trimmed = value.trim();
  if (trimmed.includes(",") && !/^\d{1,3}(?:,\d{3})+(?:\.\d{0,2})?$/.test(trimmed)) return trimmed;
  return trimmed.replaceAll(",", "").replace(/\.$/, "");
}

// Keep the caret next to the edited digit when separators are inserted or removed.
export function formatInputElement(input: HTMLInputElement, formatter: (value: string) => string, preserveCharacterPositions = false) {
  const original = input.value;
  const caret = input.selectionStart ?? original.length;
  const significant = original.slice(0, caret).replace(/[-,\s]/g, "").length;
  const formatted = formatter(original);
  let position = 0, seen = 0;
  while (position < formatted.length && seen < significant) {
    if (!/[-,\s]/.test(formatted[position])) seen += 1;
    position += 1;
  }
  if (preserveCharacterPositions) position = Math.min(caret, formatted.length);
  input.value = formatted;
  requestAnimationFrame(() => {
    if (document.activeElement === input) input.setSelectionRange(position, position);
  });
  return formatted;
}
export const REFERENCE_RELATIONSHIPS = ["Madre", "Padre", "Hermano", "Hermana", "Esposo", "Esposa", "Otro"] as const;

