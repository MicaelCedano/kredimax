export const applicationIncomeSources = [
  { value: "employee", label: "Empleado" },
  { value: "business_owner", label: "Negocio propio" },
] as const;

export const businessDocumentRequirements = [
  { field: "businessFinancialStatement", label: "Estado financiero de los últimos 6 meses" },
  { field: "businessUtilityBill", label: "Comprobante de un servicio público a nombre del solicitante" },
  { field: "businessRegistryCertificate", label: "Certificado del Registro Mercantil" },
] as const;

export type BusinessDocumentField = (typeof businessDocumentRequirements)[number]["field"];
export const businessDocumentsMaxBytes = 4_000_000;
export const businessDocumentsUnavailableMessage = "La carga de documentos no está disponible. Comunícate con el administrador.";
export const businessDocumentExtensions = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;
