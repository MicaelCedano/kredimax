import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { executeKrediMaxBackup } from "../src/lib/backups/backup-service.ts";

function loadEnv() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (existsSync(envPath)) {
    const content = readFileSync(envPath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = trimmed.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const val = match[2].trim().replace(/^['"]|['"]$/g, "");
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnv();

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("❌ ERROR: DATABASE_URL no está definida.");
  process.exit(1);
}

const key = process.env.KREDIMAX_BACKUP_KEY;
if (!key) {
  console.error("❌ ERROR: KREDIMAX_BACKUP_KEY no está definida.");
  process.exit(1);
}

const typeArg = process.argv.find((a) => a.startsWith("--type="))?.split("=")[1] || "daily";
const validTypes = ["daily", "monthly", "manual"];
const backupType = validTypes.includes(typeArg) ? typeArg : "daily";

console.log("=================================================");
console.log("🚀 KREDIMAX — EJECUTOR DE COPIAS DE SEGURIDAD");
console.log(`Tipo: ${backupType.toUpperCase()}`);
console.log(`Fecha: ${new Date().toISOString()} (America/Santo_Domingo)`);
console.log("=================================================");

async function main() {
  const startTime = Date.now();
  try {
    const result = await executeKrediMaxBackup(dbUrl, {
      backupType,
      actorEmail: "CLI / GitHub Actions Automation",
    });

    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log("=================================================");
    console.log("✅ BACKUP COMPLETADO Y VERIFICADO EXITOSAMENTE");
    console.log(`ID: ${result.backupId}`);
    console.log(`Archivo: ${result.fileName}`);
    console.log(`Tamaño total cifrado: ${(result.totalSizeBytes / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`Checksum SHA-256: ${result.sha256}`);
    console.log(`Google Drive subido: ${result.driveUploaded ? "SÍ (" + result.driveFileId + ")" : "NO (almacenado localmente)"}`);
    console.log(`Integridad AES-256-GCM: VERIFICADA`);
    console.log(`Tiempo de ejecución: ${elapsedSec}s`);
    console.log("=================================================");
    process.exit(0);
  } catch (error) {
    console.error("=================================================");
    console.error("❌ ERROR EN LA EJECUCIÓN DEL BACKUP:");
    console.error(error);
    console.error("=================================================");
    process.exit(1);
  }
}

main();
