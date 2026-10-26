export type PaymentAllocationExport = {
  installmentId: string;
  amount: string;
};

export type PaymentExport = {
  id: string;
  loanId: string;
  branchId: string | null;
  amount: string;
  currency: string;
  receivedAt: string;
  receivedBy: string;
  paymentMethod: string;
  reference: string | null;
  paymentType: string;
  reversedAt: string | null;
  reversedBy: string | null;
  reversalReason: string | null;
  allocations: PaymentAllocationExport[];
};

const headers = [
  "Movimiento", "Pago ID", "Financiamiento ID", "Sucursal ID", "Fecha (ISO)", "Importe de caja", "Moneda", "Método",
  "Referencia", "Tipo de pago", "Usuario", "Cuota ID", "Importe aplicado", "Fecha de reverso (ISO)",
  "Reversado por", "Motivo del reverso",
];

type CsvValue = string | number | null | { exactNumber: string };

function csvCell(value: CsvValue) {
  if (value === null) return '""';
  const trustedNumber = typeof value === "object";
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error("CSV_NUMBER_NOT_FINITE");
  let text = trustedNumber ? value.exactNumber : String(value);
  if (!trustedNumber && typeof value === "string" && /^[\t\r\n ]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function row(values: CsvValue[]) {
  return values.map(csvCell).join(",") + "\r\n";
}

function exactNumber(value: string): CsvValue {
  return { exactNumber: value };
}

function negativeAmount(value: string) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value) || /^0(?:\.0{1,2})?$/.test(value)) throw new Error("CSV_AMOUNT_INVALID");
  return `-${value}`;
}

export function paymentExportHeader() {
  return row(headers);
}

export function paymentExportRows(payments: PaymentExport[]) {
  const rows: string[] = [];
  for (const payment of payments) {
    rows.push(row([
      "cobro", payment.id, payment.loanId, payment.branchId, payment.receivedAt, exactNumber(payment.amount), payment.currency,
      payment.paymentMethod, payment.reference, payment.paymentType, payment.receivedBy,
      null, null, null, null, null,
    ]));
    for (const allocation of payment.allocations) {
      rows.push(row([
        "asignacion", payment.id, payment.loanId, payment.branchId, payment.receivedAt, null, payment.currency,
        payment.paymentMethod, payment.reference, payment.paymentType, payment.receivedBy,
        allocation.installmentId, exactNumber(allocation.amount), null, null, null,
      ]));
    }
    if (payment.reversedAt) {
      rows.push(row([
        "reverso", payment.id, payment.loanId, payment.branchId, payment.reversedAt, exactNumber(negativeAmount(payment.amount)), payment.currency,
        payment.paymentMethod, payment.reference, payment.paymentType, payment.reversedBy,
        null, null, payment.reversedAt, payment.reversedBy, payment.reversalReason,
      ]));
      for (const allocation of payment.allocations) {
        rows.push(row([
          "reverso_asignacion", payment.id, payment.loanId, payment.branchId, payment.reversedAt, null, payment.currency,
          payment.paymentMethod, payment.reference, payment.paymentType, payment.reversedBy,
          allocation.installmentId, exactNumber(negativeAmount(allocation.amount)), payment.reversedAt, payment.reversedBy,
          payment.reversalReason,
        ]));
      }
    }
  }
  return rows;
}
