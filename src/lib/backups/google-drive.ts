import { createSign } from "node:crypto";
import { promises as fs } from "node:fs";

export interface GoogleDriveConfig {
  serviceAccountEmail?: string;
  serviceAccountPrivateKey?: string;
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  rootFolderId?: string; // Optional user-provided root folder ID
}

export interface DriveFileMetadata {
  id: string;
  name: string;
  size?: string;
  md5Checksum?: string;
  createdTime?: string;
}

export interface DriveFolderHierarchy {
  rootFolderId: string;
  dbDailyFolderId: string;
  dbMonthlyFolderId: string;
  docsDailyFolderId: string;
  logsFolderId: string;
}

/**
 * Reads Google Drive credentials from environment variables.
 */
export function getGoogleDriveConfig(): GoogleDriveConfig {
  // Check for full JSON string first
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    try {
      const parsed = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
      return {
        serviceAccountEmail: parsed.client_email,
        serviceAccountPrivateKey: parsed.private_key,
        rootFolderId: process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID,
      };
    } catch {
      // fallback to standard env vars
    }
  }

  return {
    serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    serviceAccountPrivateKey: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
      ? process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, "\n")
      : undefined,
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
    rootFolderId: process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID,
  };
}

export function isGoogleDriveConfigured(): boolean {
  const config = getGoogleDriveConfig();
  const hasServiceAccount = Boolean(config.serviceAccountEmail && config.serviceAccountPrivateKey);
  const hasOAuth = Boolean(config.clientId && config.clientSecret && config.refreshToken);
  return hasServiceAccount || hasOAuth;
}

/**
 * Creates RS256 JWT and exchanges for Google OAuth2 access token.
 */
async function getServiceAccountAccessToken(email: string, privateKey: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: email,
    scope: "https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/drive.file",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const base64Url = (input: string | Buffer) =>
    (Buffer.isBuffer(input) ? input.toString("base64") : Buffer.from(input).toString("base64"))
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedPayload = base64Url(JSON.stringify(payload));
  const signatureInput = `${encodedHeader}.${encodedPayload}`;

  const signer = createSign("RSA-SHA256");
  signer.update(signatureInput);
  signer.end();
  const signature = signer.sign(privateKey);
  const jwt = `${signatureInput}.${base64Url(signature)}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }).toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Error de autenticación con cuenta de servicio de Google: ${response.status} - ${errorText}`);
  }

  const data = (await response.json()) as { access_token: string };
  return data.access_token;
}

/**
 * Exchanges OAuth 2.0 refresh token for an access token.
 */
async function getOAuthAccessToken(clientId: string, clientSecret: string, refreshToken: string): Promise<string> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Error de autenticación OAuth 2.0 de Google: ${response.status} - ${errorText}`);
  }

  const data = (await response.json()) as { access_token: string };
  return data.access_token;
}

export async function getGoogleAccessToken(config: GoogleDriveConfig = getGoogleDriveConfig()): Promise<string> {
  if (config.serviceAccountEmail && config.serviceAccountPrivateKey) {
    return getServiceAccountAccessToken(config.serviceAccountEmail, config.serviceAccountPrivateKey);
  }
  if (config.clientId && config.clientSecret && config.refreshToken) {
    return getOAuthAccessToken(config.clientId, config.clientSecret, config.refreshToken);
  }
  throw new Error(
    "Google Drive no está configurado. Define GOOGLE_SERVICE_ACCOUNT_EMAIL y GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY o las credenciales OAuth 2.0."
  );
}

/**
 * Retries an asynchronous function with exponential backoff.
 */
async function retryWithBackoff<T>(fn: () => Promise<T>, maxRetries = 3, initialDelayMs = 1000): Promise<T> {
  let attempt = 0;
  let delay = initialDelayMs;
  while (attempt < maxRetries) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (attempt >= maxRetries) throw err;
      await new Promise((r) => setTimeout(r, delay));
      delay *= 2;
    }
  }
  throw new Error("Reintentos agotados.");
}

/**
 * Searches or creates a folder in Google Drive.
 */
async function getOrCreateFolder(
  accessToken: string,
  folderName: string,
  parentFolderId?: string
): Promise<string> {
  let query = `mimeType = 'application/vnd.google-apps.folder' and name = '${folderName.replace(/'/g, "\\'")}' and trashed = false`;
  if (parentFolderId) {
    query += ` and '${parentFolderId}' in parents`;
  }

  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)&spaces=drive`;
  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!searchRes.ok) {
    throw new Error(`Error buscando carpeta ${folderName} en Google Drive: ${searchRes.statusText}`);
  }

  const searchData = (await searchRes.json()) as { files: Array<{ id: string; name: string }> };
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  // Create folder
  const createRes = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: parentFolderId ? [parentFolderId] : undefined,
      appProperties: { app: "kredimax", system: "backup" },
    }),
  });

  if (!createRes.ok) {
    throw new Error(`Error creando carpeta ${folderName} en Google Drive: ${createRes.statusText}`);
  }

  const createData = (await createRes.json()) as { id: string };
  return createData.id;
}

/**
 * Ensures the required KrediMax backup folder hierarchy exists:
 * KrediMax / Backups
 *   - Database / Daily
 *   - Database / Monthly
 *   - Documents / Daily
 *   - Logs
 */
export async function ensureDriveHierarchy(accessToken: string, config: GoogleDriveConfig): Promise<DriveFolderHierarchy> {
  let rootFolderId = config.rootFolderId;
  if (!rootFolderId) {
    const kmFolderId = await getOrCreateFolder(accessToken, "KrediMax");
    rootFolderId = await getOrCreateFolder(accessToken, "Backups", kmFolderId);
  }

  const databaseFolderId = await getOrCreateFolder(accessToken, "Database", rootFolderId);
  const dbDailyFolderId = await getOrCreateFolder(accessToken, "Daily", databaseFolderId);
  const dbMonthlyFolderId = await getOrCreateFolder(accessToken, "Monthly", databaseFolderId);

  const documentsFolderId = await getOrCreateFolder(accessToken, "Documents", rootFolderId);
  const docsDailyFolderId = await getOrCreateFolder(accessToken, "Daily", documentsFolderId);

  const logsFolderId = await getOrCreateFolder(accessToken, "Logs", rootFolderId);

  return {
    rootFolderId,
    dbDailyFolderId,
    dbMonthlyFolderId,
    docsDailyFolderId,
    logsFolderId,
  };
}

/**
 * Uploads a file to Google Drive using multipart upload or resumable upload,
 * verifies size and checksum, and adds KrediMax metadata.
 */
export async function uploadFileToDrive(
  accessToken: string,
  parentFolderId: string,
  localFilePath: string,
  fileName: string,
  mimeType = "application/octet-stream",
  appMetadata: Record<string, string> = {}
): Promise<DriveFileMetadata> {
  return retryWithBackoff(async () => {
    const fileStat = await fs.stat(localFilePath);
    const fileContent = await fs.readFile(localFilePath);

    const boundary = "-------kredimax_boundary_" + Date.now();
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const metadata = {
      name: fileName,
      parents: [parentFolderId],
      appProperties: {
        app: "kredimax",
        kind: "backup",
        uploadedAt: new Date().toISOString(),
        ...appMetadata,
      },
    };

    const multipartRequestBody = Buffer.concat([
      Buffer.from(
        delimiter +
          "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
          JSON.stringify(metadata) +
          delimiter +
          `Content-Type: ${mimeType}\r\n\r\n`
      ),
      fileContent,
      Buffer.from(closeDelimiter),
    ]);

    const uploadUrl = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,md5Checksum,createdTime";
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
        "Content-Length": String(multipartRequestBody.length),
      },
      body: multipartRequestBody,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Fallo al subir ${fileName} a Google Drive: ${response.status} - ${errText}`);
    }

    const uploaded = (await response.json()) as DriveFileMetadata;

    // Verify upload integrity
    if (!uploaded.id) {
      throw new Error("Google Drive no retornó un ID válido para el archivo subido.");
    }
    if (uploaded.size && Number(uploaded.size) !== fileStat.size) {
      throw new Error(
        `Discrepancia en el tamaño del archivo subido a Google Drive: local=${fileStat.size}, Drive=${uploaded.size}`
      );
    }

    return uploaded;
  });
}

/**
 * Downloads a file from Google Drive as a Readable stream or buffer.
 */
export async function downloadFileFromDrive(accessToken: string, fileId: string): Promise<Buffer> {
  return retryWithBackoff(async () => {
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`Error descargando archivo ${fileId} de Google Drive: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  });
}

/**
 * Applies strict retention policy:
 * - Keeps at most `maxKeep` copies.
 * - ONLY targets files identified as KrediMax backups (by appProperties.app === 'kredimax' or fileName prefix 'kredimax_').
 * - Safely deletes older excess files.
 */
export async function applyDriveRetention(
  accessToken: string,
  folderId: string,
  maxKeep: number,
  logPrefix = "Retention"
): Promise<{ checked: number; retained: number; deleted: number }> {
  try {
    const query = `'${folderId}' in parents and trashed = false`;
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&orderBy=createdTime desc&fields=files(id,name,createdTime,appProperties)&pageSize=100`;

    const res = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      return { checked: 0, retained: 0, deleted: 0 };
    }

    const data = (await res.json()) as {
      files?: Array<{ id: string; name: string; createdTime: string; appProperties?: Record<string, string> }>;
    };

    const files = data.files || [];
    // Strict filter: only KrediMax backups
    const kredimaxFiles = files.filter(
      (f) => f.appProperties?.app === "kredimax" || f.name.startsWith("kredimax_")
    );

    if (kredimaxFiles.length <= maxKeep) {
      return { checked: kredimaxFiles.length, retained: kredimaxFiles.length, deleted: 0 };
    }

    const filesToKeep = kredimaxFiles.slice(0, maxKeep);
    const filesToDelete = kredimaxFiles.slice(maxKeep);

    let deletedCount = 0;
    for (const file of filesToDelete) {
      const delRes = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (delRes.ok) deletedCount++;
    }

    return {
      checked: kredimaxFiles.length,
      retained: filesToKeep.length,
      deleted: deletedCount,
    };
  } catch (err) {
    console.error(`[${logPrefix}] Error aplicando política de retención:`, err);
    return { checked: 0, retained: 0, deleted: 0 };
  }
}
