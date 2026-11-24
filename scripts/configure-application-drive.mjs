import { createHash, randomBytes } from "node:crypto";
import { once } from "node:events";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { parseEnv } from "node:util";

const envPath = ".env.local";
const prefix = "GOOGLE_DRIVE_APPLICATION_";
const folderName = "KrediMax - Documentos de solicitudes";
const folderKind = "kredimax-application-folder";
const driveApi = "https://www.googleapis.com/drive/v3/files";
const folderFields = "id,webViewLink,shared,ownedByMe,trashed,mimeType,appProperties";

function readEnvironment() {
  return readFile(envPath, "utf8").catch((error) => {
    if (error.code === "ENOENT") return "";
    throw error;
  });
}

async function requestGoogle(url, options) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Google rechazó la operación (HTTP ${response.status}).`);
  return response.json();
}

async function authorize(clientId, clientSecret) {
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  let resolveConsent;
  let rejectConsent;
  const consent = new Promise((resolve, reject) => { resolveConsent = resolve; rejectConsent = reject; });
  const server = createServer((request, response) => {
    const callback = new URL(request.url ?? "/", "http://127.0.0.1");
    if (callback.pathname !== "/oauth2callback" || callback.searchParams.get("state") !== state) {
      response.writeHead(404).end();
      return;
    }
    const code = callback.searchParams.get("code");
    response.writeHead(code ? 200 : 400, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(code ? "Autorización recibida. Regresa a la terminal para confirmar la configuración." : "Google Drive no fue autorizado.");
    if (code) resolveConsent(code);
    else rejectConsent(new Error("Google Drive no fue autorizado."));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const timer = setTimeout(() => rejectConsent(new Error("Venció el tiempo para autorizar Google Drive.")), 300_000);
  const redirectUri = `http://127.0.0.1:${server.address().port}/oauth2callback`;
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: clientId, redirect_uri: redirectUri, response_type: "code",
    scope: "https://www.googleapis.com/auth/drive.file", access_type: "offline", prompt: "consent select_account",
    state, code_challenge_method: "S256", code_challenge: createHash("sha256").update(verifier).digest("base64url"),
  });
  console.log("Abre este enlace en el navegador y autoriza la cuenta que guardará los documentos.");
  console.log(url.toString());
  try {
    const code = await consent;
    return await requestGoogle("https://oauth2.googleapis.com/token", {
      method: "POST",
      body: new URLSearchParams({
        code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri,
        grant_type: "authorization_code", code_verifier: verifier,
      }),
    });
  } finally {
    clearTimeout(timer);
    server.close();
  }
}

async function configure() {
  const [credentialsPath, rawTenantId] = process.argv.slice(2);
  const tenantId = rawTenantId?.toLowerCase();
  if (!credentialsPath || !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/.test(tenantId ?? "")) {
    throw new Error("Uso: node scripts/configure-application-drive.mjs <credenciales-de-escritorio.json> <ID-de-empresa>");
  }
  const { installed } = JSON.parse(await readFile(credentialsPath, "utf8"));
  if (!installed?.client_id || !installed.client_secret) throw new Error("Usa el JSON de un cliente OAuth de tipo Aplicación de escritorio.");
  const current = await readEnvironment();
  const configured = parseEnv(current);
  if ((configured[prefix + "TENANT_ID"] && configured[prefix + "TENANT_ID"] !== tenantId)
    || (configured[prefix + "CLIENT_ID"] && configured[prefix + "CLIENT_ID"] !== installed.client_id)) {
    throw new Error("Ya hay otro cliente OAuth o empresa configurados para los adjuntos en .env.local.");
  }

  const tokens = await authorize(installed.client_id, installed.client_secret);
  if (!tokens.access_token || !tokens.refresh_token) throw new Error("Google no devolvió autorización para guardar archivos en segundo plano.");
  const headers = { Authorization: `Bearer ${tokens.access_token}` };
  let folder;
  const configuredFolder = configured[prefix + "FOLDER_ID"];
  if (configuredFolder) {
    folder = await requestGoogle(`${driveApi}/${encodeURIComponent(configuredFolder)}?fields=${folderFields}`, { headers });
  } else {
    const query = new URLSearchParams({
      q: `'root' in parents and trashed = false and appProperties has { key='kind' and value='${folderKind}' } and appProperties has { key='tenantId' and value='${tenantId}' }`,
      fields: `files(${folderFields})`,
      spaces: "drive",
    });
    const existing = await requestGoogle(`${driveApi}?${query}`, { headers });
    folder = existing.files?.find((file) => file.ownedByMe && file.shared === false);
    folder ??= await requestGoogle(`${driveApi}?fields=${folderFields}`, {
      method: "POST", headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: folderName, mimeType: "application/vnd.google-apps.folder", appProperties: { kind: folderKind, tenantId },
      }),
    });
  }
  if (!folder.id || !folder.ownedByMe || folder.shared !== false || folder.trashed || folder.mimeType !== "application/vnd.google-apps.folder"
    || folder.appProperties?.kind !== folderKind || folder.appProperties.tenantId !== tenantId) {
    throw new Error("La carpeta de adjuntos debe ser privada y pertenecer a la cuenta autorizada.");
  }

  const keptLines = current.split(/\r?\n/).filter((line) => !new RegExp(`^\\s*(?:export\\s+)?${prefix}(CLIENT_ID|CLIENT_SECRET|REFRESH_TOKEN|FOLDER_ID|TENANT_ID)\\s*=`).test(line));
  const values = {
    CLIENT_ID: installed.client_id, CLIENT_SECRET: installed.client_secret,
    REFRESH_TOKEN: tokens.refresh_token, FOLDER_ID: folder.id, TENANT_ID: tenantId,
  };
  const lines = Object.entries(values).map(([key, value]) => `${prefix}${key}=${JSON.stringify(value)}`);
  const tempPath = `.env.local.${randomBytes(8).toString("hex")}.local`;
  await writeFile(tempPath, `${keptLines.join("\n").trimEnd()}\n\n${lines.join("\n")}\n`, { mode: 0o600, flag: "wx" });
  try {
    if (await readEnvironment() !== current) throw new Error(".env.local cambió durante la autorización. Ejecuta el comando de nuevo.");
    await rename(tempPath, envPath);
  } finally {
    await rm(tempPath, { force: true });
  }
  console.log(`Carpeta privada configurada: ${folder.webViewLink ?? folder.id}`);
  console.log("Reinicia el servidor de KrediMax para cargar la configuración.");
}

configure().catch((error) => {
  console.error(error instanceof SyntaxError ? "El JSON de credenciales no es válido." : error.message);
  process.exitCode = 1;
});
