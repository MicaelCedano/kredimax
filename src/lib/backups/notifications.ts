import postgres from "postgres";

export async function notifyAdmins(
  databaseUrl: string,
  params: {
    tenantId?: string | null;
    category: "system_backup" | "backup_failure" | "backup_warning" | "backup_success";
    title: string;
    body: string;
  }
): Promise<number> {
  const sql = postgres(databaseUrl, { ssl: "require", max: 1, prepare: false });
  try {
    // Find all active tenant_admin and platform_admin users
    let query;
    if (params.tenantId) {
      query = await sql`
        SELECT tm.user_id, tm.tenant_id
        FROM public.tenant_memberships tm
        WHERE tm.tenant_id = ${params.tenantId}
          AND tm.role IN ('platform_admin', 'tenant_admin')
          AND tm.status = 'active'
      `;
    } else {
      query = await sql`
        SELECT tm.user_id, tm.tenant_id
        FROM public.tenant_memberships tm
        WHERE tm.role IN ('platform_admin', 'tenant_admin')
          AND tm.status = 'active'
      `;
    }

    if (!query || query.length === 0) return 0;

    let inserted = 0;
    for (const admin of query) {
      await sql`
        INSERT INTO public.notifications (
          id, tenant_id, user_id, category, title, body, created_at
        ) VALUES (
          gen_random_uuid(), ${admin.tenant_id}, ${admin.user_id},
          ${params.category}, ${params.title}, ${params.body}, now()
        )
      `;
      inserted++;
    }

    return inserted;
  } catch (err) {
    console.error("Error creating backup notifications:", err);
    return 0;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/**
 * Checks for consecutive backup failures and triggers critical alert if threshold exceeded.
 */
export async function checkConsecutiveFailures(databaseUrl: string, tenantId?: string | null): Promise<number> {
  const sql = postgres(databaseUrl, { ssl: "require", max: 1, prepare: false });
  try {
    const recent = await sql`
      SELECT status, started_at, error_message
      FROM public.system_backups
      ORDER BY started_at DESC
      LIMIT 5
    `;

    let consecutiveFailures = 0;
    for (const b of recent) {
      if (b.status === "failed") {
        consecutiveFailures++;
      } else if (b.status === "completed") {
        break;
      }
    }

    if (consecutiveFailures >= 2) {
      await notifyAdmins(databaseUrl, {
        tenantId,
        category: "backup_failure",
        title: `🚨 Alerta: ${consecutiveFailures} fallos consecutivos en copias de seguridad`,
        body: `Se han detectado ${consecutiveFailures} intentos de backup consecutivos con error. Verifique la conexión a la base de datos y los permisos de Google Drive inmediatamente desde Administración → Configuración → Copias de seguridad.`,
      });
    }

    return consecutiveFailures;
  } finally {
    await sql.end({ timeout: 5 });
  }
}
