const DOMINICAN_TIME_ZONE = "America/Santo_Domingo";

/**
 * Formats a numeric or decimal string into Dominican Pesos (RD$).
 * Uses exact integer cents arithmetic to avoid floating point drift.
 */
export function formatDopCurrency(value: string | number | bigint): string {
  if (typeof value === "bigint") {
    const sign = value < 0n ? "-" : "";
    const abs = value < 0n ? -value : value;
    const whole = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    const cents = (abs % 100n).toString().padStart(2, "0");
    return `${sign}RD$${whole}.${cents}`;
  }
  const raw = String(value ?? "0").trim().replace(/,/g, "");
  const match = /^(-)?(\d+)(?:\.(\d{1,2})\d*)?$/.exec(raw);
  if (!match) {
    return "RD$0.00";
  }
  const sign = match[1] ? "-" : "";
  const whole = BigInt(match[2]).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const cents = (match[3] ?? "").padEnd(2, "0").slice(0, 2);
  return `${sign}RD$${whole}.${cents}`;
}

/**
 * Formats an ISO date or YYYY-MM-DD string in Dominican Republic locale and timezone.
 */
export function formatDominicanDate(
  isoOrDate: string | null | undefined,
  style: "short" | "medium" | "long" = "medium",
): string {
  if (!isoOrDate) return "Pendiente";
  try {
    const normalized = /^\d{4}-\d{2}-\d{2}$/.test(isoOrDate)
      ? `${isoOrDate}T12:00:00-04:00`
      : isoOrDate;
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) return isoOrDate;
    return new Intl.DateTimeFormat("es-DO", {
      dateStyle: style,
      timeZone: DOMINICAN_TIME_ZONE,
    }).format(date);
  } catch {
    return isoOrDate;
  }
}

/**
 * Formats a timestamp with date and hour in Dominican Republic timezone.
 */
export function formatDominicanDateTime(isoTimestamp: string | null | undefined): string {
  if (!isoTimestamp) return "No registrado";
  try {
    const date = new Date(isoTimestamp);
    if (Number.isNaN(date.getTime())) return isoTimestamp;
    return new Intl.DateTimeFormat("es-DO", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: DOMINICAN_TIME_ZONE,
    }).format(date);
  } catch {
    return isoTimestamp;
  }
}

/**
 * Returns a personalized greeting based on the current hour in the Dominican Republic.
 */
export function getDominicanGreeting(now: Date = new Date()): string {
  try {
    const hourStr = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: DOMINICAN_TIME_ZONE,
    }).format(now);
    const hour = Number.parseInt(hourStr, 10);
    if (hour >= 5 && hour < 12) return "Buenos días";
    if (hour >= 12 && hour < 19) return "Buenas tardes";
    return "Buenas noches";
  } catch {
    return "Hola";
  }
}

/**
 * Normalizes a Dominican cédula to 11 digits, or returns null if invalid.
 */
export function normalizeCedulaDigits(input: string | null | undefined): string | null {
  if (!input) return null;
  const digits = input.replace(/\D/g, "");
  if (!/^\d{11}$/.test(digits) || /^0+$/.test(digits)) return null;
  return digits;
}

/**
 * Formats user typing into Dominican cédula mask: 000-0000000-0
 */
export function formatCedulaInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 10) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 10)}-${digits.slice(10, 11)}`;
}

/**
 * Partially masks a cédula so full identity numbers are NEVER exposed in logs,
 * analytics, error messages, or UI headers (`***-****890-1`).
 */
export function maskCedulaForDisplay(raw: string | null | undefined): string {
  if (!raw) return "***-*******-*";
  if (raw.startsWith("***-****")) return raw;
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 11) return "***-*******-*";
  return `***-****${digits.slice(7, 10)}-${digits.slice(10)}`;
}

/**
 * Validates that a new customer password is strong and NEVER uses the last 4 digits
 * or any 4-digit sequence of the customer's cédula.
 */
export function validatePasswordAgainstCedula(
  password: string,
  cedulaOrMasked?: string | null,
): { valid: true } | { valid: false; reason: string } {
  if (!password || password.length < 10 || password.length > 128) {
    return {
      valid: false,
      reason: "La contraseña debe tener al menos 10 caracteres.",
    };
  }
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
    return {
      valid: false,
      reason: "Incluye al menos una letra mayúscula, una minúscula y un número.",
    };
  }
  if (cedulaOrMasked) {
    const cleanDigits = cedulaOrMasked.replace(/\D/g, "");
    if (cleanDigits.length >= 4) {
      const lastFour = cleanDigits.slice(-4);
      if (password.includes(lastFour)) {
        return {
          valid: false,
          reason:
            "Por seguridad, nunca puedes usar los últimos 4 dígitos de tu cédula en la contraseña.",
        };
      }
      for (let i = 0; i <= cleanDigits.length - 4; i += 1) {
        const sub = cleanDigits.slice(i, i + 4);
        if (sub.length === 4 && password.includes(sub)) {
          return {
            valid: false,
            reason: "Por seguridad, la contraseña no puede contener secuencias de tu cédula.",
          };
        }
      }
    }
  }
  return { valid: true };
}

export function translatePaymentMethod(method: string): string {
  const map: Record<string, string> = {
    cash: "Efectivo en sucursal",
    transfer: "Transferencia bancaria",
    card: "Tarjeta",
    other: "Otro medio",
  };
  return map[method] ?? method;
}

/**
 * Normalizes a Dominican or international phone number for WhatsApp `wa.me` links.
 * If 10 digits starting with 809/829/849, prepends country code `1`.
 */
export function normalizeWhatsappPhone(raw: string | null | undefined): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (!digits) return "18095550188";
  if (digits.length === 10 && /^(809|829|849)/.test(digits)) {
    return `1${digits}`;
  }
  return digits;
}

/**
 * Builds the WhatsApp URL (`https://wa.me/<phone>?text=...`) that redirects the customer
 * directly to their assigned sales executive ("Ejecutivo de venta encargado") to pay or
 * report a payment.
 */
export function buildExecutiveWhatsAppPaymentUrl(params: {
  executiveName: string;
  executiveWhatsapp: string;
  customerName: string;
  maskedCedula: string;
  contractNumber: string;
  deviceLabel: string;
  installmentSequence?: number | null;
  dueDateFormatted?: string | null;
  amountFormatted: string;
  conceptLabel?: string;
}): string {
  const phone = normalizeWhatsappPhone(params.executiveWhatsapp);
  const cuotaLine = params.installmentSequence
    ? `• Cuota: *Cuota #${params.installmentSequence}*${params.dueDateFormatted ? ` (Vence: ${params.dueDateFormatted})` : ""}`
    : `• Concepto: *${params.conceptLabel ?? "Abono a financiamiento"}*`;

  const message = [
    `Hola *${params.executiveName}* (Ejecutivo de Venta Encargado KrediMax),`,
    `Soy *${params.customerName}* (${params.maskedCedula}).`,
    "",
    "Quiero realizar / enviar el pago de mi financiamiento por esta vía:",
    `• Equipo: *${params.deviceLabel}*`,
    `• Contrato: *${params.contractNumber}*`,
    cuotaLine,
    `• Monto a pagar: *${params.amountFormatted}*`,
    "",
    "Te envío mi comprobante o quedo atento(a) a tus indicaciones para aplicar el pago.",
  ].join("\n");

  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

