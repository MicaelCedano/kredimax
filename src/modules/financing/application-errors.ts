import { businessDocumentRequirements } from "./application-income";

export const applicationFields: Record<string, { label: string; step: number }> = {
  customerId: { label: "Selecciona un cliente existente", step: 0 },
  customerFullName: { label: "Nombre completo", step: 0 },
  customerIdentityNumber: { label: "Cédula o documento", step: 0 },
  customerPhone: { label: "Teléfono del cliente", step: 0 },
  customerAddress: { label: "Dirección", step: 0 },
  branchId: { label: "Sucursal de origen", step: 0 },
  employer: { label: "Empleo / empresa", step: 0 },
  incomeSource: { label: "Fuente de ingresos", step: 0 },
  ...Object.fromEntries(businessDocumentRequirements.map(({ field, label }) => [field, { label, step: 0 }])),
  monthlyIncome: { label: "Ingreso mensual", step: 0 },
  referenceIdentityNumber: { label: "Cédula de referencia", step: 0 },
  referenceName: { label: "Referencia personal", step: 0 },
  referenceRelationship: { label: "Parentesco de referencia", step: 0 },
  referencePhone: { label: "Teléfono de referencia", step: 0 },
  referenceConsent: { label: "Autorización de referencia", step: 0 },
  brand: { label: "Marca", step: 1 }, model: { label: "Modelo", step: 1 },
  imei: { label: "IMEI", step: 1 }, condition: { label: "Condición", step: 1 },
  salePrice: { label: "Precio de venta", step: 1 },
  termMonths: { label: "Plazo", step: 2 }, frequency: { label: "Frecuencia", step: 2 },
  firstInstallmentDate: { label: "Fecha de primera cuota", step: 2 },
  downPaymentPercent: { label: "Porcentaje de inicial", step: 2 },
};

export function applicationIssueFields(issues: readonly { path: readonly PropertyKey[]; message: string }[]) {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const name = String(issue.path[0] ?? "");
    if (!applicationFields[name] || fields[name]) continue;
    fields[name] = name === "imei" || name === "referenceIdentityNumber" ? issue.message : `Revisa ${applicationFields[name].label.toLocaleLowerCase("es-DO")}; el valor está incompleto o supera el formato permitido.`;
  }
  return fields;
}
