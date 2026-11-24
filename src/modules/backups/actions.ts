"use server";

import { revalidatePath } from "next/cache";
import { getTenantAccess } from "@/lib/security/tenant-access";
import { executeKrediMaxBackup } from "@/lib/backups/backup-service";
import { downloadFileFromDrive, getGoogleAccessToken } from "@/lib/backups/google-drive";
import { verifyEncryptedFile } from "@/lib/backups/crypto";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

export async function createManualBackupAction() {
  const access = await getTenantAccess("settings.manage");
  if (!access.ok) {
    return { ok: false, error: access.reason === "unauthenticated" ? "No autenticado" : "No autorizado" };
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return { ok: false, error: "DATABASE_URL no está configurada." };
  }

  try {
    const result = await executeKrediMaxBackup(databaseUrl, {
      backupType: "manual",
      tenantId: access.membership.tenant_id,
      actorId: access.userId,
      actorEmail: "Administrador KrediMax",
    });

    revalidatePath("/configuracion/backups");
    revalidatePath("/configuracion");
    return { ok: true, backupId: result.backupId, fileName: result.fileName };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

export async function verifyBackupIntegrityAction(formData: FormData) {
  const access = await getTenantAccess("settings.manage");
  if (!access.ok) {
    return { ok: false, error: "No autorizado" };
  }

  const backupId = String(formData.get("backupId") || "").trim();
  if (!backupId) {
    return { ok: false, error: "ID de backup inválido." };
  }

  const { data: backup, error } = await access.supabase
    .from("system_backups")
    .select("id, file_name, sha256_checksum, drive_file_id, manifest")
    .eq("id", backupId)
    .single();

  if (error || !backup) {
    return { ok: false, error: "No se encontró el registro de la copia de seguridad." };
  }

  try {
    if (!backup.drive_file_id) {
      return { ok: false, error: "El archivo no tiene ID de Google Drive para verificación remota." };
    }

    const accessToken = await getGoogleAccessToken();
    const buffer = await downloadFileFromDrive(accessToken, backup.drive_file_id);

    const tempPath = join(tmpdir(), `kredimax-verify-${Date.now()}.enc`);
    await fs.writeFile(tempPath, buffer);

    try {
      const verification = await verifyEncryptedFile(tempPath);

      if (verification.sha256 !== backup.sha256_checksum) {
        throw new Error(
          `Discrepancia en el hash SHA-256: registrado=${backup.sha256_checksum}, calculado=${verification.sha256}`
        );
      }

      await access.supabase
        .from("system_backups")
        .update({
          integrity_status: "verified",
          integrity_verified_at: new Date().toISOString(),
        })
        .eq("id", backupId);

      revalidatePath("/configuracion/backups");
      return { ok: true, sha256: verification.sha256, sizeBytes: verification.sizeBytes };
    } finally {
      await fs.rm(tempPath, { force: true });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await access.supabase
      .from("system_backups")
      .update({
        integrity_status: "failed",
        error_message: `Fallo de verificación de integridad: ${message}`,
      })
      .eq("id", backupId);

    revalidatePath("/configuracion/backups");
    return { ok: false, error: message };
  }
}

export async function restoreBackupAction(formData: FormData) {
  const access = await getTenantAccess("settings.manage");
  if (!access.ok) {
    return { ok: false, error: "No autorizado. Solo administradores pueden restaurar copias de seguridad." };
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return { ok: false, error: "DATABASE_URL no está configurada." };
  }

  const confirmationText = String(formData.get("confirmationText") || "").trim();
  if (confirmationText !== "RESTAURAR") {
    return { ok: false, error: "Debes escribir exactamente la palabra RESTAURAR para confirmar." };
  }

  const backupId = String(formData.get("backupId") || "").trim();
  const uploadedFile = formData.get("backupFile") as File | null;

  const tempDir = join(tmpdir(), `kredimax-restore-job-${Date.now()}`);
  await fs.mkdir(tempDir, { recursive: true });

  let archivePath = "";

  try {
    if (uploadedFile && uploadedFile.size > 0) {
      archivePath = join(tempDir, uploadedFile.name || "uploaded.dump.kmax.enc");
      const buffer = Buffer.from(await uploadedFile.arrayBuffer());
      await fs.writeFile(archivePath, buffer);
    } else if (backupId) {
      const { data: backup, error } = await access.supabase
        .from("system_backups")
        .select("id, file_name, sha256_checksum, drive_file_id, status")
        .eq("id", backupId)
        .single();

      if (error || !backup) {
        return { ok: false, error: "No se encontró el registro de la copia de seguridad." };
      }

      archivePath = join(tempDir, backup.file_name);

      if (backup.drive_file_id) {
        const accessToken = await getGoogleAccessToken();
        const buffer = await downloadFileFromDrive(accessToken, backup.drive_file_id);
        await fs.writeFile(archivePath, buffer);
      } else {
        return {
          ok: false,
          error: "El backup seleccionado no se encuentra en Google Drive. Puedes descargarlo o subir el archivo .kmax.enc directamente.",
        };
      }
    } else {
      return { ok: false, error: "Selecciona una copia del historial o sube un archivo cifrado." };
    }

    // 1. Create automatic pre-restore safety snapshot
    try {
      await executeKrediMaxBackup(databaseUrl, {
        backupType: "manual",
        tenantId: access.membership.tenant_id,
        actorId: access.userId,
        actorEmail: "Snapshot de seguridad pre-restauración",
      });
    } catch (preError) {
      console.warn("No se pudo generar snapshot pre-restauración:", preError);
    }

    // 2. Execute full restore
    const { executeDatabaseRestore } = await import("@/lib/backups/restore");
    const restoreResult = await executeDatabaseRestore(databaseUrl, archivePath, {
      actorId: access.userId,
      actorEmail: "Administrador KrediMax",
    });

    // 3. Record in audit_logs
    await access.supabase.from("audit_logs").insert({
      tenant_id: access.membership.tenant_id,
      actor_id: access.userId,
      action: "system.backup.restore",
      entity_type: "system_backups",
      entity_id: backupId ? backupId : null,
      metadata: {
        restoredAt: new Date().toISOString(),
        backupId: backupId || "uploaded_file",
        verification: restoreResult.verification,
      },
    });

    // 4. Notify admins
    const { notifyAdmins } = await import("@/lib/backups/notifications");
    await notifyAdmins(databaseUrl, {
      tenantId: access.membership.tenant_id,
      category: "backup_success",
      title: "🔄 Restauración de base de datos completada",
      body: `Se ha restaurado la base de datos al estado del backup. ${restoreResult.message}`,
    });

    revalidatePath("/configuracion/backups");
    revalidatePath("/configuracion");
    revalidatePath("/");

    return { ok: true, message: restoreResult.message };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}
