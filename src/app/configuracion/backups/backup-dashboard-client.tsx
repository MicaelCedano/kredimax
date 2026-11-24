"use client";

import { useState, useTransition } from "react";
import {
  AlertTriangle,
  ArrowDownToLine,
  CheckCircle2,
  Clock,
  Database,
  FileCheck,
  HardDrive,
  History,
  Lock,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import { createManualBackupAction, restoreBackupAction, verifyBackupIntegrityAction } from "@/modules/backups/actions";

export interface SystemBackupRecord {
  id: string;
  backup_type: string;
  target_type: string;
  status: string;
  pg_version: string | null;
  file_name: string;
  file_size_bytes: string | number;
  sha256_checksum: string;
  encryption_algorithm: string;
  drive_file_id: string | null;
  drive_folder_path: string | null;
  manifest: Record<string, unknown> | null;
  error_message: string | null;
  integrity_status: string;
  integrity_verified_at: string | null;
  started_at: string;
  completed_at: string | null;
  created_by_name: string | null;
}

export function BackupDashboardClient({
  backups,
  driveConfigured,
  nextScheduledTime,
  initialOpenRestoreModal = false,
}: {
  backups: SystemBackupRecord[];
  driveConfigured: boolean;
  nextScheduledTime: string;
  initialOpenRestoreModal?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [isRestoring, setIsRestoring] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const [showRestoreModal, setShowRestoreModal] = useState(initialOpenRestoreModal);
  const [selectedBackupForRestore, setSelectedBackupForRestore] = useState<SystemBackupRecord | null>(
    backups.find((b) => b.status === "completed") || backups[0] || null
  );
  const [restoreMode, setRestoreMode] = useState<"history" | "upload">("history");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [confirmationText, setConfirmationText] = useState("");
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  const lastSuccessfulBackup = backups.find((b) => b.status === "completed");
  const failedBackupsCount = backups.filter((b) => b.status === "failed").length;

  const handleCreateBackup = () => {
    setActionMessage({ type: "info", text: "Iniciando copia de seguridad completa y cifrado AES-256-GCM..." });
    startTransition(async () => {
      const res = await createManualBackupAction();
      if (res.ok) {
        setActionMessage({
          type: "success",
          text: `Copia de seguridad ${res.fileName} creada, cifrada y verificada exitosamente.`,
        });
      } else {
        setActionMessage({
          type: "error",
          text: `Error al crear backup: ${res.error}`,
        });
      }
    });
  };

  const handleVerifyIntegrity = (backupId: string) => {
    setVerifyingId(backupId);
    const formData = new FormData();
    formData.append("backupId", backupId);

    startTransition(async () => {
      const res = await verifyBackupIntegrityAction(formData);
      setVerifyingId(null);
      if (res.ok) {
        setActionMessage({
          type: "success",
          text: `Integridad criptográfica verificada: Hash SHA-256 y firma AES-256-GCM coinciden al 100%.`,
        });
      } else {
        setActionMessage({
          type: "error",
          text: `Fallo en la verificación de integridad: ${res.error}`,
        });
      }
    });
  };

  const handleExecuteRestore = () => {
    if (confirmationText !== "RESTAURAR") return;
    setIsRestoring(true);
    setActionMessage({ type: "info", text: "Creando snapshot de seguridad e iniciando restauración..." });

    const formData = new FormData();
    formData.append("confirmationText", "RESTAURAR");

    if (restoreMode === "upload" && uploadedFile) {
      formData.append("backupFile", uploadedFile);
    } else if (selectedBackupForRestore) {
      formData.append("backupId", selectedBackupForRestore.id);
    }

    startTransition(async () => {
      const res = await restoreBackupAction(formData);
      setIsRestoring(false);
      if (res.ok) {
        setShowRestoreModal(false);
        setConfirmationText("");
        setActionMessage({
          type: "success",
          text: `Base de datos restaurada exitosamente. ${res.message || ""}`,
        });
      } else {
        setActionMessage({
          type: "error",
          text: `Error en la restauración: ${res.error}`,
        });
      }
    });
  };

  const formatBytes = (bytes: number | string) => {
    const num = Number(bytes);
    if (!num || isNaN(num)) return "0 KB";
    if (num > 1024 * 1024) return `${(num / (1024 * 1024)).toFixed(2)} MB`;
    return `${(num / 1024).toFixed(1)} KB`;
  };

  const formatDominicanDateTime = (isoDate: string) => {
    try {
      return new Intl.DateTimeFormat("es-DO", {
        timeZone: "America/Santo_Domingo",
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      }).format(new Date(isoDate));
    } catch {
      return isoDate;
    }
  };

  return (
    <div className="space-y-6">
      {/* Alert Banners */}
      {!driveConfigured && (
        <div className="flex items-start gap-3 rounded-xl border border-warning-line bg-warning-soft p-4 text-xs text-warning">
          <AlertTriangle className="mt-0.5 shrink-0" size={18} />
          <div>
            <p className="font-bold">Google Drive pendiente de vincular</p>
            <p className="mt-0.5">
              Las copias de seguridad se están generando, cifrando (AES-256-GCM) y verificando localmente. Para
              habilitar la replicación remota automática a Google Drive, añade las credenciales de la Cuenta de Servicio en las variables de entorno.
            </p>
          </div>
        </div>
      )}

      {failedBackupsCount > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-danger-line bg-danger-soft p-4 text-xs text-danger">
          <ShieldAlert className="mt-0.5 shrink-0" size={18} />
          <div>
            <p className="font-bold">Advertencia de errores en historial</p>
            <p className="mt-0.5">
              Se han registrado incidencias en {failedBackupsCount} ejecución(es) anterior(es). Consulta los detalles en el historial.
            </p>
          </div>
        </div>
      )}

      {actionMessage && (
        <div
          role="status"
          className={`flex items-center justify-between rounded-xl border px-4 py-3 text-xs font-semibold ${
            actionMessage.type === "success"
              ? "border-positive-line bg-positive-soft text-positive"
              : actionMessage.type === "error"
              ? "border-danger-line bg-danger-soft text-danger"
              : "border-accent-line bg-accent-soft text-accent"
          }`}
        >
          <span>{actionMessage.text}</span>
          <button
            onClick={() => setActionMessage(null)}
            className="rounded p-1 hover:bg-black/5"
            aria-label="Cerrar mensaje"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Primary KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: System Status */}
        <div className="km-panel rounded-xl border border-line bg-surface p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">Estado del sistema</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-positive-soft px-2.5 py-0.5 text-[11px] font-bold text-positive">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Operativo
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <p className="text-2xl font-bold tracking-tight text-ink">Protegido</p>
          </div>
          <p className="mt-1 flex items-center gap-1 text-[11px] text-muted">
            <Lock size={12} className="text-brand" /> Cifrado autenticado AES-256-GCM
          </p>
        </div>

        {/* Card 2: Last Successful Backup */}
        <div className="km-panel rounded-xl border border-line bg-surface p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">Último backup</span>
            <CheckCircle2 size={16} className="text-emerald-500" />
          </div>
          <p className="mt-3 text-lg font-bold text-ink">
            {lastSuccessfulBackup ? formatDominicanDateTime(lastSuccessfulBackup.started_at) : "Sin registros aún"}
          </p>
          <p className="mt-1 text-[11px] text-muted">
            Tamaño: {lastSuccessfulBackup ? formatBytes(lastSuccessfulBackup.file_size_bytes) : "0 MB"} · SHA-256 OK
          </p>
        </div>

        {/* Card 3: Next Scheduled Backup */}
        <div className="km-panel rounded-xl border border-line bg-surface p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">Próximo programado</span>
            <Clock size={16} className="text-accent" />
          </div>
          <p className="mt-3 text-lg font-bold text-ink">{nextScheduledTime}</p>
          <p className="mt-1 text-[11px] text-muted">Hora Dominicana (America/Santo_Domingo · 3:00 AM)</p>
        </div>

        {/* Card 4: Google Drive Destination */}
        <div className="km-panel rounded-xl border border-line bg-surface p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">Destino Google Drive</span>
            <HardDrive size={16} className={driveConfigured ? "text-emerald-500" : "text-amber-500"} />
          </div>
          <p className="mt-3 text-base font-bold text-ink truncate">
            {driveConfigured ? "KrediMax / Backups" : "Pendiente vincular"}
          </p>
          <p className="mt-1 text-[11px] text-muted truncate">
            {driveConfigured ? "Retención: 30 diarios · 12 mensuales" : "Guardado seguro local"}
          </p>
        </div>
      </div>

      {/* Action Buttons Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleCreateBackup}
            disabled={isPending || isRestoring}
            className="km-primary inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
            title="Generar una copia de seguridad inmediata"
          >
            {isPending && !isRestoring ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
            Hacer backup ahora
          </button>

          <button
            onClick={() => {
              setConfirmationText("");
              setShowRestoreModal(true);
            }}
            disabled={isPending || isRestoring}
            className="inline-flex items-center gap-2 rounded-lg border border-accent-line bg-accent-soft px-3.5 py-2 text-xs font-bold text-accent hover:bg-accent-soft/80 disabled:opacity-50"
            title="Abrir asistente de restauración de copias"
          >
            <RotateCcw size={14} />
            Restaurar copia
          </button>

          <a
            href="#historial"
            className="inline-flex items-center gap-2 rounded-lg border border-line bg-canvas px-3.5 py-2 text-xs font-semibold text-secondary hover:bg-subtle"
          >
            <History size={14} />
            Ver historial ({backups.length})
          </a>
        </div>

        <div className="text-xs text-muted">
          Clave de cifrado activa: <span className="font-mono font-semibold text-ink">AES-256-GCM (64-hex)</span>
        </div>
      </div>

      {/* Execution History Table */}
      <section id="historial" className="km-panel rounded-xl border border-line bg-surface p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-ink">Historial de copias de seguridad</h2>
            <p className="text-xs text-muted">
              Todas las copias están cifradas con AES-256-GCM y verificadas mediante SHA-256 antes de guardarse.
            </p>
          </div>
          <span className="text-xs font-semibold text-muted">Total: {backups.length} ejecuciones</span>
        </div>

        {backups.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line p-8 text-center">
            <Database size={32} className="mx-auto text-muted mb-2" />
            <p className="text-sm font-semibold text-ink">Aún no se han ejecutado copias de seguridad.</p>
            <p className="text-xs text-muted mt-1">Haz clic en &quot;Hacer backup ahora&quot; para generar la primera copia cifrada.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-line bg-subtle/50 text-[11px] font-bold uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-3 py-3">Fecha y Hora (AST)</th>
                  <th className="px-3 py-3">Tipo</th>
                  <th className="px-3 py-3">Archivo / Checksum</th>
                  <th className="px-3 py-3">Tamaño</th>
                  <th className="px-3 py-3">Estado</th>
                  <th className="px-3 py-3">Integridad</th>
                  <th className="px-3 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60 font-normal text-secondary">
                {backups.map((b) => (
                  <tr key={b.id} className="hover:bg-subtle/40 transition-colors">
                    <td className="px-3 py-3.5 font-medium text-ink whitespace-nowrap">
                      {formatDominicanDateTime(b.started_at)}
                      <div className="text-[10px] text-muted">{b.created_by_name || "Programación automática"}</div>
                    </td>
                    <td className="px-3 py-3.5 whitespace-nowrap">
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                          b.backup_type === "daily"
                            ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                            : b.backup_type === "monthly"
                            ? "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300"
                            : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300"
                        }`}
                      >
                        {b.backup_type === "daily" ? "Diario" : b.backup_type === "monthly" ? "Mensual" : "Manual"}
                      </span>
                    </td>
                    <td className="px-3 py-3.5 font-mono text-[11px]">
                      <div className="font-semibold text-ink truncate max-w-xs">{b.file_name}</div>
                      <div className="text-[10px] text-muted truncate max-w-xs" title={b.sha256_checksum}>
                        SHA-256: {b.sha256_checksum.slice(0, 16)}...
                      </div>
                    </td>
                    <td className="px-3 py-3.5 whitespace-nowrap font-semibold">{formatBytes(b.file_size_bytes)}</td>
                    <td className="px-3 py-3.5 whitespace-nowrap">
                      {b.status === "completed" ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold">
                          <CheckCircle2 size={13} /> Completado
                        </span>
                      ) : b.status === "in_progress" ? (
                        <span className="inline-flex items-center gap-1 text-blue-600 font-semibold">
                          <RefreshCw size={13} className="animate-spin" /> En curso
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 text-red-600 font-semibold"
                          title={b.error_message || "Error desconocido"}
                        >
                          <AlertTriangle size={13} /> Fallido
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3.5 whitespace-nowrap">
                      {b.integrity_status === "verified" ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 font-medium text-[11px]">
                          <ShieldCheck size={13} /> Verificada
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-600 font-medium text-[11px]">
                          <Clock size={13} /> Pendiente
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3.5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        {/* Direct RESTORE Button for each individual backup */}
                        {b.status === "completed" && (
                          <button
                            onClick={() => {
                              setSelectedBackupForRestore(b);
                              setRestoreMode("history");
                              setConfirmationText("");
                              setShowRestoreModal(true);
                            }}
                            className="inline-flex items-center gap-1 rounded-md border border-accent-line bg-accent-soft px-2.5 py-1 text-[11px] font-bold text-accent hover:bg-accent-soft/80"
                            title="Restaurar la base de datos a este punto en el tiempo"
                          >
                            <RotateCcw size={12} /> Restaurar
                          </button>
                        )}

                        {b.drive_file_id && b.status === "completed" && (
                          <a
                            href={`/api/backups/${b.id}/download`}
                            className="inline-flex items-center gap-1 rounded-md border border-line bg-surface px-2.5 py-1 text-[11px] font-semibold text-ink hover:bg-subtle"
                            title="Descargar archivo cifrado (.kmax.enc)"
                          >
                            <ArrowDownToLine size={12} /> Descargar
                          </a>
                        )}

                        <button
                          onClick={() => handleVerifyIntegrity(b.id)}
                          disabled={isPending || verifyingId === b.id || !b.drive_file_id}
                          className="inline-flex items-center gap-1 rounded-md border border-line bg-surface px-2.5 py-1 text-[11px] font-semibold text-secondary hover:bg-subtle disabled:opacity-40"
                          title="Verificar autenticidad criptográfica SHA-256 y AES-256-GCM"
                        >
                          {verifyingId === b.id ? (
                            <RefreshCw size={12} className="animate-spin text-accent" />
                          ) : (
                            <FileCheck size={12} />
                          )}
                          Verificar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Interactive Restoration Modal */}
      {showRestoreModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="km-panel w-full max-w-2xl rounded-2xl border border-line bg-surface p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-line pb-4">
              <div className="flex items-center gap-2.5">
                <div className="rounded-lg bg-accent-soft p-2 text-accent">
                  <RotateCcw size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-ink">Restaurar copia de seguridad</h3>
                  <p className="text-xs text-muted">
                    Recuperación asistida con snapshot de seguridad previo y validación criptográfica
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowRestoreModal(false)}
                className="rounded-lg p-1.5 text-muted hover:bg-subtle hover:text-ink"
                aria-label="Cerrar modal"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 space-y-4 text-xs leading-relaxed text-secondary">
              {/* Origin Selection Tabs */}
              <div className="flex rounded-lg border border-line p-1 bg-subtle/50">
                <button
                  type="button"
                  onClick={() => setRestoreMode("history")}
                  className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors ${
                    restoreMode === "history"
                      ? "bg-surface text-ink shadow-xs"
                      : "text-muted hover:text-secondary"
                  }`}
                >
                  Desde el historial
                </button>
                <button
                  type="button"
                  onClick={() => setRestoreMode("upload")}
                  className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors ${
                    restoreMode === "upload"
                      ? "bg-surface text-ink shadow-xs"
                      : "text-muted hover:text-secondary"
                  }`}
                >
                  Subir archivo (.kmax.enc)
                </button>
              </div>

              {restoreMode === "history" ? (
                <div className="space-y-3">
                  <label className="block text-xs font-semibold text-secondary">
                    Selecciona la copia de seguridad que deseas restaurar:
                    <select
                      value={selectedBackupForRestore?.id || ""}
                      onChange={(e) => {
                        const found = backups.find((b) => b.id === e.target.value);
                        if (found) setSelectedBackupForRestore(found);
                      }}
                      className="km-input mt-1.5 w-full rounded-lg border border-field-border bg-surface px-3 py-2 text-xs font-normal"
                    >
                      {backups
                        .filter((b) => b.status === "completed")
                        .map((b) => (
                          <option key={b.id} value={b.id}>
                            {formatDominicanDateTime(b.started_at)} — {b.file_name} ({formatBytes(b.file_size_bytes)})
                          </option>
                        ))}
                    </select>
                  </label>

                  {selectedBackupForRestore && (
                    <div className="rounded-lg border border-line bg-subtle/40 p-3 font-mono text-[11px] space-y-1">
                      <div className="text-ink font-bold">Resumen de la copia seleccionada:</div>
                      <div>Archivo: {selectedBackupForRestore.file_name}</div>
                      <div>Tamaño: {formatBytes(selectedBackupForRestore.file_size_bytes)}</div>
                      <div>SHA-256: {selectedBackupForRestore.sha256_checksum}</div>
                      <div>Ubicación: {selectedBackupForRestore.drive_folder_path || "Google Drive"}</div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <label className="block text-xs font-semibold text-secondary">
                    Selecciona el archivo cifrado descargado previamente (.dump.kmax.enc):
                    <div className="mt-2 flex items-center justify-center rounded-xl border border-dashed border-line p-5 bg-subtle/20 hover:bg-subtle/40 cursor-pointer">
                      <input
                        type="file"
                        accept=".enc,.dump"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) setUploadedFile(file);
                        }}
                        className="w-full text-xs"
                      />
                    </div>
                  </label>
                  {uploadedFile && (
                    <p className="text-xs text-emerald-600 font-semibold flex items-center gap-1.5">
                      <Upload size={14} /> Archivo cargado: {uploadedFile.name} ({(uploadedFile.size / 1024).toFixed(1)} KB)
                    </p>
                  )}
                </div>
              )}

              {/* Safety notice */}
              <div className="rounded-xl border border-warning-line bg-warning-soft p-3.5 text-xs text-warning">
                <p className="font-bold flex items-center gap-1.5">
                  <Lock size={14} /> Protección de datos y Snapshot Automático
                </p>
                <p className="mt-1">
                  Al confirmar la restauración, el sistema <b>generará automáticamente un respaldo de seguridad previo</b> del estado actual antes de aplicar los datos. La base de datos se sincronizará con el estado exacto registrado en la copia.
                </p>
              </div>

              {/* Confirmation text input */}
              <div className="rounded-lg border border-line bg-surface p-3.5 space-y-2">
                <label className="block text-xs font-bold text-ink">
                  Para autorizar la restauración, escribe exactamente la palabra{" "}
                  <span className="font-mono text-brand font-extrabold uppercase">RESTAURAR</span>:
                  <input
                    type="text"
                    value={confirmationText}
                    onChange={(e) => setConfirmationText(e.target.value)}
                    placeholder="RESTAURAR"
                    className="km-input mt-1.5 w-full rounded-lg border border-field-border bg-surface px-3 py-2 text-sm font-semibold text-ink uppercase"
                  />
                </label>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
              <button
                type="button"
                onClick={() => setShowRestoreModal(false)}
                className="rounded-lg border border-line bg-surface px-4 py-2 text-xs font-semibold text-secondary hover:bg-subtle"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={handleExecuteRestore}
                disabled={isRestoring || isPending || confirmationText.trim() !== "RESTAURAR" || (restoreMode === "upload" && !uploadedFile)}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-red-700 disabled:opacity-40"
              >
                {isRestoring ? <RefreshCw size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                {isRestoring ? "Restaurando base de datos..." : "Confirmar y Restaurar Base de Datos"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
