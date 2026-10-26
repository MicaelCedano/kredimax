export const RECEIPT_STATUSES = { "": "Todos los estados", registered: "Registrados", reversed: "Revertidos" };
export const RECEIPT_TYPES = { "": "Todos los tipos", down_payment: "Inicial", installment: "Pago de cuotas" };
export const RECEIPT_METHODS = { "": "Todos los métodos", cash: "Efectivo", bank_transfer: "Transferencia bancaria", card: "Tarjeta", other: "Otro", unspecified: "No especificado" };
export type ReceiptQuery = { q?: string; status?: string; type?: string; method?: string; branch?: string; customer?: string; from?: string; to?: string; page?: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function parseReceiptFilters(query: ReceiptQuery) {
  const filters = { q: (query.q ?? "").trim().slice(0, 100), status: query.status ?? "", type: query.type ?? "", method: query.method ?? "", branch: query.branch ?? "", customer: query.customer ?? "", from: query.from ?? "", to: query.to ?? "", page: Math.max(1, Math.min(100000, Number.parseInt(query.page ?? "1", 10) || 1)) };
  const invalid = !Object.hasOwn(RECEIPT_STATUSES, filters.status) || !Object.hasOwn(RECEIPT_TYPES, filters.type) || !Object.hasOwn(RECEIPT_METHODS, filters.method)
    || Boolean(filters.branch && !uuid.test(filters.branch)) || Boolean(filters.customer && !uuid.test(filters.customer))
    || Boolean(filters.from && !validDate(filters.from)) || Boolean(filters.to && !validDate(filters.to))
    || Boolean(filters.from && filters.to && filters.from > filters.to);
  return { ...filters, invalid };
}

export function receiptListHref(filters: ReturnType<typeof parseReceiptFilters>, page = 1) {
  const params = new URLSearchParams();
  for (const key of ["q", "status", "type", "method", "branch", "customer", "from", "to"] as const) if (filters[key]) params.set(key, filters[key]);
  if (page > 1) params.set("page", String(page));
  return `/recibos${params.size ? `?${params}` : ""}`;
}
