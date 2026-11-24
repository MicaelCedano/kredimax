import { businessDocumentRequirements, businessDocumentsMaxBytes, type BusinessDocumentField } from "./application-income";

function documentMimeType(bytes: Buffer) {
  if (bytes.toString("latin1", 0, 5) === "%PDF-") return "application/pdf";
  if (bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return "image/jpeg";
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes.toString("latin1", 0, 4) === "RIFF" && bytes.toString("latin1", 8, 12) === "WEBP") return "image/webp";
  return null;
}

export type BusinessApplicationDocument = {
  field: BusinessDocumentField;
  label: string;
  bytes: Buffer;
  mimeType: NonNullable<ReturnType<typeof documentMimeType>>;
};

export async function readBusinessApplicationDocuments(formData: FormData) {
  const fieldErrors: Record<string, string> = {};
  const files = businessDocumentRequirements.flatMap(({ field, label }) => {
    const file = formData.get(field);
    if (typeof file === "string" || !file?.size) {
      fieldErrors[field] = "Adjunta este documento.";
      return [];
    }
    return [{ field, label, file }];
  });
  if (Object.keys(fieldErrors).length) return { fieldErrors };
  if (files.reduce((total, { file }) => total + file.size, 0) > businessDocumentsMaxBytes) {
    fieldErrors[files[0].field] = "Reduce el tamaño de los archivos. Los tres documentos juntos deben pesar 4 MB o menos.";
    return { fieldErrors };
  }
  const documents: BusinessApplicationDocument[] = [];
  for (const { field, label, file } of files) {
    const bytes = Buffer.from(await file.arrayBuffer());
    const mimeType = documentMimeType(bytes);
    if (!mimeType || (file.type && file.type !== mimeType)) {
      fieldErrors[field] = "Adjunta un archivo PDF o una imagen JPG, PNG o WebP válida.";
    } else {
      documents.push({ field, label, bytes, mimeType });
    }
  }
  return Object.keys(fieldErrors).length ? { fieldErrors } : { documents };
}

export function applicationDriveFileId(snapshot: unknown, field: BusinessDocumentField): string | undefined {
  const applicant = (snapshot as { applicant?: { businessDocumentFiles?: unknown } } | null)?.applicant;
  if (!Array.isArray(applicant?.businessDocumentFiles)) return;
  const document = applicant.businessDocumentFiles.find((entry) => entry?.field === field);
  return typeof document?.driveFileId === "string" && /^[\w-]{1,200}$/.test(document.driveFileId) ? document.driveFileId : undefined;
}
