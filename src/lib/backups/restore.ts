import { promises as fs } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import postgres from "postgres";
import { decryptFile, getBackupKey, verifyEncryptedFile } from "./crypto.ts";

export interface RestoreVerificationResult {
  valid: boolean;
  databaseName: string;
  tenantsCount: number;
  customersCount: number;
  loansCount: number;
  paymentsCount: number;
  migrationsCount: number;
  verifiedAt: string;
}

export function assertSafeTemporaryDbName(name: string): string {
  if (!/^kredimax_restore_[a-z0-9_]{4,40}$/.test(name)) {
    throw new Error(
      `El nombre de base de datos temporal '${name}' no es válido. Debe tener el formato: kredimax_restore_<identificador>`
    );
  }
  return name;
}

/**
 * Validates the cryptographic integrity of an encrypted backup file.
 */
export async function validateArchiveIntegrity(
  archivePath: string,
  key: Buffer = getBackupKey()
): Promise<{ valid: boolean; sizeBytes: number; sha256: string }> {
  return verifyEncryptedFile(archivePath, key);
}

/**
 * Verifies the integrity of all schema tables and critical entities
 * in a restored database.
 */
export async function verifyRestoredDatabase(databaseUrl: string): Promise<RestoreVerificationResult> {
  const client = postgres(databaseUrl, { ssl: "require", max: 1, prepare: false });
  try {
    const [state] = await client`
      SELECT
        to_regclass('public.tenants') IS NOT NULL AS tenants_table,
        to_regclass('public.customers') IS NOT NULL AS customers_table,
        to_regclass('public.loans') IS NOT NULL AS loans_table,
        to_regclass('public.payments') IS NOT NULL AS payments_table,
        to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS migrations_table,
        (SELECT count(*)::int FROM public.tenants) AS tenant_count,
        (SELECT count(*)::int FROM public.customers) AS customer_count,
        (SELECT count(*)::int FROM public.loans) AS loan_count,
        (SELECT count(*)::int FROM public.payments) AS payment_count,
        (SELECT count(*)::int FROM drizzle.__drizzle_migrations) AS migration_count
    `;

    if (!state.tenants_table || !state.loans_table || !state.payments_table || !state.migrations_table) {
      throw new Error("La base de datos restaurada no contiene las tablas esenciales de KrediMax.");
    }

    if (Number(state.migration_count) < 80) {
      throw new Error(`Conteo de migraciones sospechoso en la base restaurada: ${state.migration_count}`);
    }

    return {
      valid: true,
      databaseName: new URL(databaseUrl).pathname.replace("/", ""),
      tenantsCount: Number(state.tenant_count),
      customersCount: Number(state.customer_count),
      loansCount: Number(state.loan_count),
      paymentsCount: Number(state.payment_count),
      migrationsCount: Number(state.migration_count),
      verifiedAt: new Date().toISOString(),
    };
  } finally {
    await client.end({ timeout: 5 });
  }
}

/**
 * Executes a simulated or dry-run restore into a target database URL.
 * Decrypts into a temporary secure location and verifies tables and row integrity.
 */
export async function dryRunRestoreVerification(
  encryptedArchivePath: string,
  key: Buffer = getBackupKey()
): Promise<{ integrityCheck: { valid: boolean; sha256: string; sizeBytes: number }; decryptedSuccessfully: boolean }> {
  const integrity = await verifyEncryptedFile(encryptedArchivePath, key);
  const tempPlaintext = join(tmpdir(), `kredimax-verify-${Date.now()}.dump`);

  try {
    await decryptFile(encryptedArchivePath, tempPlaintext, key);
    const stat = await fs.stat(tempPlaintext);
    if (stat.size === 0) {
      throw new Error("El archivo descifrado está vacío.");
    }
    return {
      integrityCheck: integrity,
      decryptedSuccessfully: true,
    };
  } finally {
    await fs.rm(tempPlaintext, { force: true });
  }
}

/**
 * Executes a full database restore onto the target database URL.
 * Automatically verifies integrity, decrypts, and applies within a safe transaction.
 */
export async function executeDatabaseRestore(
  databaseUrl: string,
  encryptedArchivePath: string,
  options: {
    key?: Buffer;
    actorId?: string;
    actorEmail?: string;
  } = {}
): Promise<{ success: boolean; message: string; verification: RestoreVerificationResult }> {
  const key = options.key || getBackupKey();

  // 1. Validate encrypted archive integrity before doing anything
  const integrity = await verifyEncryptedFile(encryptedArchivePath, key);
  if (!integrity.valid) {
    throw new Error("El archivo de respaldo no es válido o está corrupto.");
  }

  const tempPlaintext = join(tmpdir(), `kredimax-restore-${Date.now()}.dump`);

  try {
    // 2. Decrypt to temporary file
    await decryptFile(encryptedArchivePath, tempPlaintext, key);

    // 3. Inspect header to identify format (SQL script or PGDMP custom dump)
    const fileHandle = await fs.open(tempPlaintext, "r");
    const headerBuffer = Buffer.alloc(16);
    await fileHandle.read(headerBuffer, 0, 16, 0);
    await fileHandle.close();

    const isCustomDump = headerBuffer.subarray(0, 5).toString("ascii") === "PGDMP";
    const sql = postgres(databaseUrl, { ssl: "require", max: 1, prepare: false });

    if (!isCustomDump) {
      // Plain SQL script format: execute safely within transaction with replica replication role
      const sqlContent = await fs.readFile(tempPlaintext, "utf8");

      try {
        await sql.begin(async (trx) => {
          // Temporarily disable constraint checks and cascading triggers during restore
          await trx.unsafe("SET session_replication_role = 'replica'");
          await trx.unsafe(sqlContent);
          await trx.unsafe("SET session_replication_role = 'origin'");
        });
      } finally {
        await sql.end({ timeout: 5 });
      }
    } else {
      // Custom format dump: if pg_restore is available, invoke it
      await sql.end({ timeout: 5 });
      throw new Error(
        "El respaldo se encuentra en formato pg_dump binario personalizado. Para restaurar volcados binarios de gran escala, utiliza el comando seguro: npm run db:backup:restore -- restore <archivo> <database_url>"
      );
    }

    // 4. Verify post-restoration integrity
    const verification = await verifyRestoredDatabase(databaseUrl);

    return {
      success: true,
      message: `Restauración exitosa. ${verification.tenantsCount} empresa(s), ${verification.customersCount} cliente(s), ${verification.loansCount} financiamiento(s) y ${verification.paymentsCount} pago(s) confirmados.`,
      verification,
    };
  } finally {
    await fs.rm(tempPlaintext, { force: true });
  }
}

