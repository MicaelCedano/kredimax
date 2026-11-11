import { randomUUID } from "node:crypto";
import { businessDocumentExtensions, businessDocumentsMaxBytes, type BusinessDocumentField } from "@/modules/financing/application-income";
import type { BusinessApplicationDocument } from "@/modules/financing/application-documents";

const driveApi = "https://www.googleapis.com/drive/v3/files";
const driveUploadApi = "https://www.googleapis.com/upload/drive/v3/files";
const driveDocumentKind = "kredimax-application-document";

type DriveContext = { tenantId: string; submissionKey: string; actorId: string };
type DriveDocument = { field: BusinessDocumentField; driveFileId: string };

function driveConfig(tenantId: string) {
  const clientId = process.env.GOOGLE_DRIVE_APPLICATION_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_DRIVE_APPLICATION_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_DRIVE_APPLICATION_REFRESH_TOKEN;
  const folderId = process.env.GOOGLE_DRIVE_APPLICATION_FOLDER_ID;
  if (tenantId !== process.env.GOOGLE_DRIVE_APPLICATION_TENANT_ID || !clientId || !clientSecret || !refreshToken || !folderId) return null;
  return { clientId, clientSecret, refreshToken, folderId };
}

export function isApplicationDriveConfigured(tenantId: string) {
  return driveConfig(tenantId) !== null;
}

async function getApplicationDriveAccessToken(config: NonNullable<ReturnType<typeof driveConfig>>) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error("Google no autorizó el acceso a Drive.");
  const { access_token } = await response.json();
  if (typeof access_token !== "string" || !access_token) throw new Error("Google no devolvió un token de acceso.");
  return access_token;
}

function driveRequest(token: string, url: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return fetch(url, { ...options, headers, cache: "no-store", signal: AbortSignal.timeout(12_000) });
}

async function deleteDriveFiles(token: string, ids: string[]) {
  await Promise.all(ids.map(async (id) => {
    try {
      const response = await driveRequest(token, `${driveApi}/${id}`, { method: "DELETE" });
      if (response.ok || response.status === 404) return;
    } catch {
      // Keep the original upload or save error.
    }
    console.error("[KrediMax] No se pudo limpiar un adjunto de solicitud en Drive.");
  }));
}

export async function uploadBusinessApplicationDocuments(documents: BusinessApplicationDocument[], context: DriveContext) {
  const config = driveConfig(context.tenantId);
  if (!config) throw new Error("Drive de solicitudes sin configurar.");
  const token = await getApplicationDriveAccessToken(config);
  const folder = await driveRequest(token, `${driveApi}/${encodeURIComponent(config.folderId)}?fields=trashed,mimeType,ownedByMe,shared,appProperties`);
  if (!folder.ok) throw new Error("Carpeta de solicitudes inaccesible.");
  const metadata = await folder.json();
  if (metadata.trashed || !metadata.ownedByMe || metadata.shared !== false || metadata.mimeType !== "application/vnd.google-apps.folder"
    || metadata.appProperties?.kind !== "kredimax-application-folder" || metadata.appProperties?.tenantId !== context.tenantId) {
    throw new Error("La carpeta de solicitudes debe ser privada y pertenecer a esta empresa.");
  }

  const generated = await driveRequest(token, `${driveApi}/generateIds?count=${documents.length}&space=drive&type=files`);
  if (!generated.ok) throw new Error("No se pudieron reservar IDs de Drive.");
  const { ids } = await generated.json() as { ids?: string[] };
  if (!Array.isArray(ids) || ids.length !== documents.length || ids.some((id) => typeof id !== "string" || !/^[\w-]{1,200}$/.test(id))) {
    throw new Error("Drive no devolvió los IDs esperados.");
  }
  const results = await Promise.allSettled(documents.map(async (document, index): Promise<DriveDocument> => {
    const id = ids[index];
    const boundary = randomUUID();
    const metadata = {
      id,
      name: `SOL-${context.submissionKey.slice(0, 8).toUpperCase()} - ${document.label}.${businessDocumentExtensions[document.mimeType]}`,
      parents: [config.folderId],
      mimeType: document.mimeType,
      appProperties: { kind: driveDocumentKind, ...context, field: document.field },
    };
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${document.mimeType}\r\n\r\n`),
      document.bytes,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const response = await driveRequest(token, `${driveUploadApi}?uploadType=multipart&fields=id,size`, {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    });
    if (!response.ok) throw new Error("Falló la carga de un adjunto.");
    const saved = await response.json();
    if (saved.id !== id || Number(saved.size) !== document.bytes.length) throw new Error("Drive no confirmó la carga completa.");
    return { field: document.field, driveFileId: id };
  }));
  const savedDocuments = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  if (savedDocuments.length !== documents.length) {
    await deleteDriveFiles(token, ids);
    throw new Error("No se pudieron guardar todos los documentos en Drive.");
  }
  return {
    documents: savedDocuments,
    discardUnlinked: (linkedIds: (string | undefined)[] = []) => deleteDriveFiles(token, ids.filter((id) => !linkedIds.includes(id))),
  };
}

export async function downloadBusinessApplicationDocument(id: string, field: BusinessDocumentField, context: DriveContext) {
  const config = driveConfig(context.tenantId);
  if (!config) throw new Error("Drive de solicitudes sin configurar.");
  const token = await getApplicationDriveAccessToken(config);
  const url = `${driveApi}/${encodeURIComponent(id)}`;
  const response = await driveRequest(token, `${url}?fields=trashed,mimeType,size,appProperties`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("No se pudo consultar el adjunto en Drive.");
  const metadata = await response.json();
  const properties = metadata.appProperties;
  const mimeType = metadata.mimeType as keyof typeof businessDocumentExtensions;
  const size = Number(metadata.size);
  if (metadata.trashed || !Object.hasOwn(businessDocumentExtensions, mimeType) || !Number.isInteger(size) || size < 1 || size > businessDocumentsMaxBytes
    || properties?.kind !== driveDocumentKind || properties.tenantId !== context.tenantId
    || properties.submissionKey !== context.submissionKey || properties.actorId !== context.actorId || properties.field !== field) return null;
  const download = await driveRequest(token, `${url}?alt=media`);
  if (download.status === 404) return null;
  if (!download.ok || !download.body) throw new Error("No se pudo descargar el adjunto desde Drive.");
  return { body: download.body, mimeType, extension: businessDocumentExtensions[mimeType] };
}
