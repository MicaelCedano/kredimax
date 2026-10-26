import sharp from "sharp";

export const MAX_PAYMENT_EVIDENCE_BYTES = 8 * 1024 * 1024;
export class PaymentEvidenceError extends Error {
  constructor(public code: "evidence-required" | "signed-receipt-required" | "evidence-invalid", message: string) { super(message); }
}

export async function readPaymentEvidence(formData: FormData, method: string) {
  const file = formData.get("paymentEvidence");
  const signedReceiptAttested = formData.get("signedReceiptAttested") === "on";
  const required = method === "cash" || method === "bank_transfer";
  if (!(file instanceof File) || file.size === 0) {
    if (required) throw new PaymentEvidenceError("evidence-required", method === "cash" ? "Adjunta la foto del recibo firmado por el cliente." : "Adjunta la imagen del voucher de la transferencia.");
    return { image: null, signedReceiptAttested: false };
  }
  if (method === "cash" && !signedReceiptAttested) throw new PaymentEvidenceError("signed-receipt-required", "Confirma que la foto muestra el recibo firmado por el cliente.");
  if (file.size > MAX_PAYMENT_EVIDENCE_BYTES || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new PaymentEvidenceError("evidence-invalid", "La evidencia debe ser una imagen JPG, PNG o WebP de hasta 8 MB.");
  try {
    const source = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 25_000_000, failOn: "warning" });
    const metadata = await source.metadata();
    if (!["jpeg", "png", "webp"].includes(metadata.format ?? "") || (metadata.pages ?? 1) > 1) throw new Error("Invalid static image");
    const image = await source.rotate().resize(2000, 4000, { fit: "inside", withoutEnlargement: true }).webp({ quality: 90 }).toBuffer();
    if (image.length > 2 * 1024 * 1024) throw new Error("Image too large");
    return { image: `\\x${image.toString("hex")}`, signedReceiptAttested: method === "cash" && signedReceiptAttested };
  } catch { throw new PaymentEvidenceError("evidence-invalid", "No se pudo leer la imagen. Elige una foto fija JPG, PNG o WebP válida y legible."); }
}
