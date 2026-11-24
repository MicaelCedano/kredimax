import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { decryptFile, getBackupKey, verifyEncryptedFile } from "../src/lib/backups/crypto.ts";
import { verifyRestoredDatabase } from "../src/lib/backups/restore.ts";

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

const [,, command, archivePath, targetPath] = process.argv;

if (!command || !archivePath || !["verify", "decrypt", "restore"].includes(command)) {
  console.log("=================================================");
  console.log("🛠️  KREDIMAX — HERRAMIENTA DE RECUPERACIÓN Y RESTAURACIÓN");
  console.log("Uso:");
  console.log("  node scripts/restore-backup.mjs verify <archivo.dump.kmax.enc>");
  console.log("  node scripts/restore-backup.mjs decrypt <archivo.dump.kmax.enc> <salida.dump>");
  console.log("  node scripts/restore-backup.mjs restore <archivo.dump.kmax.enc> <target_db_url>");
  console.log("=================================================");
  process.exit(1);
}

const key = getBackupKey();

async function main() {
  if (command === "verify") {
    console.log(`🔍 Verificando integridad de: ${archivePath}`);
    const result = await verifyEncryptedFile(archivePath, key);
    console.log("✅ Integridad criptográfica AES-256-GCM verificada exitosamente.");
    console.log(`Tamaño: ${(result.sizeBytes / 1024 / 1024).toFixed(2)} MB`);
    console.log(`SHA-256: ${result.sha256}`);
  } else if (command === "decrypt") {
    if (!targetPath) {
      console.error("❌ Especifica el archivo de destino para el volcado descifrado.");
      process.exit(1);
    }
    console.log(`🔓 Descifrando ${archivePath} hacia ${targetPath}...`);
    await decryptFile(archivePath, targetPath, key);
    console.log("✅ Archivo descifrado exitosamente.");
  } else if (command === "restore") {
    if (!targetPath) {
      console.error("❌ Especifica la URL o cadena de conexión de la base temporal de destino.");
      process.exit(1);
    }

    // Safety checks against overwriting production database
    const prodDb = process.env.DATABASE_URL;
    if (prodDb && targetPath.trim() === prodDb.trim()) {
      const confirmArg = process.argv.includes("--confirm-destructive-production-overwrite");
      if (!confirmArg) {
        console.error("⛔ SEGURIDAD: Se denegó la restauración directa sobre la base de producción.");
        console.error("Para restaurar en producción debes usar una base temporal primero, validar datos y");
        console.error("proporcionar explícitamente el flag --confirm-destructive-production-overwrite.");
        process.exit(1);
      }
    }

    console.log(`🔍 1. Validando autenticidad del archivo de respaldo...`);
    const integrity = await verifyEncryptedFile(archivePath, key);
    console.log(`   SHA-256: ${integrity.sha256} — Válido`);

    console.log(`📋 2. Verificando integridad de esquema y entidades en base de destino...`);
    const verification = await verifyRestoredDatabase(targetPath);
    console.log(`✅ Base restaurada validada:`);
    console.log(`   Tenants: ${verification.tenantsCount}`);
    console.log(`   Clientes: ${verification.customersCount}`);
    console.log(`   Préstamos: ${verification.loansCount}`);
    console.log(`   Pagos: ${verification.paymentsCount}`);
    console.log(`   Migraciones aplicadas: ${verification.migrationsCount}`);
  }
}

main().catch((err) => {
  console.error("❌ Error en la operación:", err instanceof Error ? err.message : err);
  process.exit(1);
});
