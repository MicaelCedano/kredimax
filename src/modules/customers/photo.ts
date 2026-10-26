import sharp from "sharp";

export const MAX_PHOTO_UPLOAD_BYTES = 8 * 1024 * 1024;
const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function isSameOriginPhotoRequest(request: Request) {
  try {
    const origin = new URL(request.headers.get("origin") ?? "");
    return ["http:", "https:"].includes(origin.protocol) && origin.host === request.headers.get("host");
  } catch { return false; }
}

export async function prepareCustomerPhoto(bytes: Buffer, contentType: string) {
  if (!PHOTO_TYPES.has(contentType) || bytes.length === 0 || bytes.length > MAX_PHOTO_UPLOAD_BYTES) {
    throw new Error("Selecciona una imagen JPG, PNG o WebP de hasta 8 MB.");
  }
  const image = sharp(bytes, { limitInputPixels: 25_000_000, failOn: "warning" });
  const metadata = await image.metadata();
  if (!["jpeg", "png", "webp"].includes(metadata.format ?? "") || (metadata.pages ?? 1) > 1) throw new Error("La foto debe ser una imagen fija válida.");
  const photo = await image.rotate().resize(640, 640, { fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
  if (photo.length > 1024 * 1024) throw new Error("La imagen es demasiado grande. Elige otra foto.");
  return photo;
}
