import { NextRequest, NextResponse } from "next/server";
import { executeKrediMaxBackup } from "@/lib/backups/backup-service";
import { getTenantAccess } from "@/lib/security/tenant-access";

export async function POST(request: NextRequest) {
  // 1. Verify cron secret or admin session
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.KREDIMAX_BACKUP_CRON_SECRET;
  let isAuthorized = false;
  let actorEmail = "Webhook / Cron Trigger";

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    isAuthorized = true;
  } else {
    // Try admin session
    const access = await getTenantAccess("settings.manage");
    if (access.ok) {
      isAuthorized = true;
      actorEmail = "API Admin";
    }
  }

  if (!isAuthorized) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return NextResponse.json({ error: "DATABASE_URL no configurada." }, { status: 500 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const backupType = ["daily", "monthly", "manual"].includes(body.backupType) ? body.backupType : "daily";

    const result = await executeKrediMaxBackup(databaseUrl, {
      backupType,
      actorEmail,
    });

    return NextResponse.json({
      success: true,
      backupId: result.backupId,
      fileName: result.fileName,
      totalSizeBytes: result.totalSizeBytes,
      sha256: result.sha256,
      driveUploaded: result.driveUploaded,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
