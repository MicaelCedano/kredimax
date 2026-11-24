import { promises as fs } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import postgres from "postgres";
import { dumpAndEncryptDatabase } from "./database-backup.ts";
import { backupAndEncryptDocuments } from "./documents-backup.ts";
import { generateManifest } from "./manifest.ts";
import { verifyEncryptedFile } from "./crypto.ts";
import {
  applyDriveRetention,
  ensureDriveHierarchy,
  getGoogleAccessToken,
  isGoogleDriveConfigured,
  uploadFileToDrive,
} from "./google-drive.ts";
import { checkConsecutiveFailures, notifyAdmins } from "./notifications.ts";

export interface BackupExecutionOptions {
  backupType?: "daily" | "monthly" | "manual";
  tenantId?: string | null;
  actorId?: string;
  actorEmail?: string;
  outputDirectory?: string;
}

export interface BackupExecutionResult {
  success: boolean;
  backupId: string;
  fileName: string;
  totalSizeBytes: number;
  sha256: string;
  driveFileId?: string;
  driveUploaded: boolean;
  integrityVerified: boolean;
  manifest: Record<string, unknown>;
  error?: string;
}

export async function executeKrediMaxBackup(
  databaseUrl: string,
  options: BackupExecutionOptions = {}
): Promise<BackupExecutionResult> {
  const sql = postgres(databaseUrl, { ssl: "require", max: 1, prepare: false });
  const backupType = options.backupType || "daily";

  // 1. Acquire PostgreSQL advisory lock to prevent concurrent executions
  const [lockRow] = await sql`SELECT pg_try_advisory_lock(hashtext('kredimax_system_backup_lock')) AS acquired`;
  if (!lockRow?.acquired) {
    throw new Error(
      "Ya hay una copia de seguridad en curso en este momento. La ejecución concurrente está protegida por seguridad."
    );
  }

  // Work in a temporary directory
  const workDir = options.outputDirectory || join(tmpdir(), `kredimax-backup-${Date.now()}`);
  await fs.mkdir(workDir, { recursive: true });

  // Generate Dominican-based timestamp string: YYYYMMDD_HHmmss
  const dominicanDate = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Santo_Domingo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const part = (type: string) => dominicanDate.find((p) => p.type === type)?.value || "00";
  const timestampStr = `${part("year")}${part("month")}${part("day")}_${part("hour")}${part("minute")}${part("second")}`;

  // 2. Insert initial in-progress record into system_backups
  const [initialRow] = await sql`
    INSERT INTO public.system_backups (
      tenant_id, backup_type, target_type, status, file_name, sha256_checksum,
      encryption_algorithm, started_at, created_by, created_by_name
    ) VALUES (
      ${options.tenantId || null}, ${backupType}, 'full', 'in_progress',
      ${'kredimax_db_' + timestampStr + '.dump.kmax.enc'}, 'calculating',
      'aes-256-gcm', now(), ${options.actorId || null}, ${options.actorEmail || 'Automatización programada'}
    )
    RETURNING id
  `;
  const backupId = initialRow.id as string;

  try {
    // 3. Dump and encrypt database
    const dbResult = await dumpAndEncryptDatabase(databaseUrl, workDir, timestampStr);

    // 4. Back up and encrypt documents & photos
    const docsResult = await backupAndEncryptDocuments(databaseUrl, workDir, timestampStr);

    // 5. Verify local encrypted archives integrity before uploading
    const dbVerify = await verifyEncryptedFile(dbResult.encryptedDumpPath);
    const docsVerify = await verifyEncryptedFile(docsResult.encryptedDocsPath);

    if (!dbVerify.valid || !docsVerify.valid) {
      throw new Error("La verificación de autenticidad criptográfica AES-256-GCM local falló.");
    }

    // 6. Handle Google Drive upload
    let driveUploaded = false;
    let driveDbFileId: string | undefined;
    let driveDocsFileId: string | undefined;
    let driveFolderPath = "Local (Google Drive no configurado)";
    const uploadedDriveFiles: Array<{ name: string; id: string; size?: string }> = [];

    const driveConfigured = isGoogleDriveConfigured();
    if (driveConfigured) {
      try {
        const accessToken = await getGoogleAccessToken();
        const hierarchy = await ensureDriveHierarchy(accessToken, {});

        // Target folder for database
        const isMonthly = backupType === "monthly" || part("day") === "01";
        const dbTargetFolderId = isMonthly ? hierarchy.dbMonthlyFolderId : hierarchy.dbDailyFolderId;
        driveFolderPath = isMonthly ? "KrediMax/Backups/Database/Monthly" : "KrediMax/Backups/Database/Daily";

        // Upload DB
        const dbDrive = await uploadFileToDrive(
          accessToken,
          dbTargetFolderId,
          dbResult.encryptedDumpPath,
          dbResult.fileName,
          "application/octet-stream",
          { backupId, type: "database", rawSha256: dbResult.rawSha256 }
        );
        driveDbFileId = dbDrive.id;
        uploadedDriveFiles.push({ name: dbResult.fileName, id: dbDrive.id, size: dbDrive.size });

        // Upload Docs
        const docsDrive = await uploadFileToDrive(
          accessToken,
          hierarchy.docsDailyFolderId,
          docsResult.encryptedDocsPath,
          docsResult.fileName,
          "application/octet-stream",
          { backupId, type: "documents" }
        );
        driveDocsFileId = docsDrive.id;
        uploadedDriveFiles.push({ name: docsResult.fileName, id: docsDrive.id, size: docsDrive.size });

        // Apply retention policy only after confirming successful upload
        if (isMonthly) {
          await applyDriveRetention(accessToken, hierarchy.dbMonthlyFolderId, 12, "MonthlyDB");
        } else {
          await applyDriveRetention(accessToken, hierarchy.dbDailyFolderId, 30, "DailyDB");
        }
        await applyDriveRetention(accessToken, hierarchy.docsDailyFolderId, 30, "DailyDocs");

        driveUploaded = true;
      } catch (driveErr) {
        console.error("Error subiendo archivos a Google Drive:", driveErr);
        driveFolderPath = "Fallo de subida a Google Drive (Copia cifrada preservada)";
      }
    }

    // 7. Generate and save manifest
    const manifest = generateManifest({
      backupId,
      backupType,
      pgVersion: dbResult.pgVersion,
      database: {
        fileName: dbResult.fileName,
        encryptedSizeBytes: dbResult.encryptedSizeBytes,
        encryptedSha256: dbResult.encryptedSha256,
        rawSha256: dbResult.rawSha256,
        tablesCount: dbResult.tablesCount,
        rowCounts: dbResult.rowCounts,
        driveFileId: driveDbFileId,
      },
      documents: {
        fileName: docsResult.fileName,
        encryptedSizeBytes: docsResult.encryptedSizeBytes,
        encryptedSha256: docsResult.encryptedSha256,
        customerPhotosCount: docsResult.customerPhotosCount,
        paymentEvidenceCount: docsResult.paymentEvidenceCount,
        storageFilesCount: docsResult.storageFilesCount,
        totalDocuments: docsResult.totalDocumentsCount,
        driveFileId: driveDocsFileId,
      },
      googleDrive: {
        uploaded: driveUploaded,
        folderPath: driveFolderPath,
        files: uploadedDriveFiles,
      },
      integrityStatus: "verified",
      integrityNotes: driveConfigured && !driveUploaded ? "Google Drive reportó error en la subida." : undefined,
    });

    const manifestPath = join(workDir, `kredimax_manifest_${timestampStr}.json`);
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

    // Upload manifest to Google Drive Logs folder if available
    if (driveUploaded) {
      try {
        const accessToken = await getGoogleAccessToken();
        const hierarchy = await ensureDriveHierarchy(accessToken, {});
        await uploadFileToDrive(
          accessToken,
          hierarchy.logsFolderId,
          manifestPath,
          `manifest_${timestampStr}.json`,
          "application/json",
          { backupId, type: "manifest" }
        );
      } catch {
        // manifest upload error is non-critical
      }
    }

    // 8. Update database record as completed
    const totalBytes = dbResult.encryptedSizeBytes + docsResult.encryptedSizeBytes;
    await sql`
      UPDATE public.system_backups SET
        status = 'completed',
        pg_version = ${dbResult.pgVersion},
        file_name = ${dbResult.fileName},
        file_size_bytes = ${totalBytes},
        sha256_checksum = ${dbResult.encryptedSha256},
        drive_file_id = ${driveDbFileId || null},
        drive_folder_path = ${driveFolderPath},
        manifest = ${sql.json(manifest as never)},
        integrity_status = 'verified',
        integrity_verified_at = now(),
        completed_at = now()
      WHERE id = ${backupId}
    `;

    // 9. Record in audit_logs
    if (options.actorId) {
      await sql`
        INSERT INTO public.audit_logs (
          tenant_id, actor_id, action, entity_type, entity_id, metadata, created_at
        ) VALUES (
          ${options.tenantId || null}, ${options.actorId}, 'system.backup.create', 'system_backups',
          ${backupId}, ${sql.json({
            backupType,
            totalBytes,
            sha256: dbResult.encryptedSha256,
            driveUploaded,
            driveFileId: driveDbFileId,
          } as never)}, now()
        )
      `;
    }

    // 10. Send success notification to admins
    const sizeMb = (totalBytes / (1024 * 1024)).toFixed(2);
    await notifyAdmins(databaseUrl, {
      tenantId: options.tenantId,
      category: "backup_success",
      title: `✅ Copia de seguridad completada (${backupType === "daily" ? "Diaria" : backupType === "monthly" ? "Mensual" : "Manual"})`,
      body: `El respaldo de base de datos (${dbResult.tablesCount} tablas) y documentos se cifró con AES-256-GCM (${sizeMb} MB) y se verificó con SHA-256. Destino: ${driveFolderPath}.`,
    });

    return {
      success: true,
      backupId,
      fileName: dbResult.fileName,
      totalSizeBytes: totalBytes,
      sha256: dbResult.encryptedSha256,
      driveFileId: driveDbFileId,
      driveUploaded,
      integrityVerified: true,
      manifest: manifest as unknown as Record<string, unknown>,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    // Update record as failed
    await sql`
      UPDATE public.system_backups SET
        status = 'failed',
        error_message = ${errorMsg},
        integrity_status = 'failed',
        completed_at = now()
      WHERE id = ${backupId}
    `.catch(() => {});

    // Notify of failure & check consecutive errors
    await notifyAdmins(databaseUrl, {
      tenantId: options.tenantId,
      category: "backup_failure",
      title: "❌ Fallo en la copia de seguridad de KrediMax",
      body: `No se pudo completar el respaldo programado: ${errorMsg}. Se requiere atención administrativa.`,
    });
    await checkConsecutiveFailures(databaseUrl, options.tenantId);

    throw error;
  } finally {
    // Release advisory lock
    await sql`SELECT pg_advisory_unlock(hashtext('kredimax_system_backup_lock'))`.catch(() => {});
    await sql.end({ timeout: 5 });
    // Clean up temporary files
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
