import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { getTenantAccess } from "@/lib/security/tenant-access";
import { isGoogleDriveConfigured } from "@/lib/backups/google-drive";
import { BackupDashboardClient, SystemBackupRecord } from "./backup-dashboard-client";

function getNextScheduledBackupTime(): string {
  const now = new Date();
  // Format current Dominican hour
  const dominicanDate = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Santo_Domingo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(now);

  const getPart = (type: string) => Number(dominicanDate.find((p) => p.type === type)?.value || 0);
  const hour = getPart("hour");

  const targetDate = new Date(now);
  if (hour >= 3) {
    // Tomorrow at 3:00 AM AST
    targetDate.setDate(targetDate.getDate() + 1);
  }

  const formattedDate = new Intl.DateTimeFormat("es-DO", {
    timeZone: "America/Santo_Domingo",
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(targetDate);

  return `${formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1)} · 3:00 AM`;
}

export default async function BackupsPage({
  searchParams,
}: {
  searchParams?: Promise<{ modal?: string }>;
}) {
  const [{ modal } = { modal: undefined }, access] = await Promise.all([
    searchParams ? searchParams : Promise.resolve({ modal: undefined }),
    getTenantAccess("settings.manage"),
  ]);
  if (!access.ok && access.reason === "unauthenticated") {
    redirect("/login");
  }

  if (!access.ok) {
    return (
      <div className="min-h-screen bg-canvas">
        <Sidebar />
        <Topbar />
        <main id="main-content" tabIndex={-1} className="km-main px-5 py-10 lg:ml-[244px]">
          <p role="alert" className="rounded-xl border border-warning-line bg-warning-soft p-4 text-sm text-warning">
            Acceso restringido: Solo un Administrador de empresa o Superadministrador puede gestionar las copias de seguridad.
          </p>
          <Link href="/configuracion" className="mt-4 inline-flex text-sm font-semibold text-accent">
            Volver a configuración
          </Link>
        </main>
      </div>
    );
  }

  const { data: backupsData } = await access.supabase
    .from("system_backups")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(50);

  const backups = (backupsData || []) as SystemBackupRecord[];
  const driveConfigured = isGoogleDriveConfigured();
  const nextScheduled = getNextScheduledBackupTime();

  return (
    <div className="min-h-screen bg-canvas">
      <Sidebar />
      <Topbar />
      <main id="main-content" tabIndex={-1} className="km-main px-4 pb-12 pt-7 sm:px-7 lg:ml-[244px] lg:px-7">
        <div className="mb-4 flex items-center gap-3">
          <Link
            href="/configuracion"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:underline"
          >
            <ArrowLeft size={14} /> Volver a Configuración
          </Link>
          <span className="text-xs text-muted">/</span>
          <span className="text-xs font-medium text-secondary">Copias de seguridad</span>
        </div>

        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[.14em] text-accent">
            Administración · Seguridad y Resiliencia
          </p>
          <h1 className="mt-1 text-[26px] font-bold tracking-[-.6px] text-ink">
            Copias de seguridad y recuperación (DRP)
          </h1>
          <p className="mt-1 text-sm text-muted">
            Respaldo automático diario a las 3:00 a. m. (AST) con cifrado autenticado AES-256-GCM, verificación de integridad SHA-256 y replicación en Google Drive.
          </p>
        </div>

        <BackupDashboardClient
          backups={backups}
          driveConfigured={driveConfigured}
          nextScheduledTime={nextScheduled}
          initialOpenRestoreModal={modal === "restaurar"}
        />
      </main>
    </div>
  );
}
