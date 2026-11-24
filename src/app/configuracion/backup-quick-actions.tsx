"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Play, RotateCcw, RefreshCw, CheckCircle2, AlertTriangle, ShieldCheck } from "lucide-react";
import { createManualBackupAction } from "@/modules/backups/actions";

export function BackupQuickActions() {
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const handleCreateNow = () => {
    setFeedback(null);
    startTransition(async () => {
      const res = await createManualBackupAction();
      if (res.ok) {
        setFeedback({
          type: "success",
          message: `Backup ${res.fileName} generado y cifrado exitosamente (AES-256-GCM).`,
        });
      } else {
        setFeedback({
          type: "error",
          message: `No se pudo generar el backup: ${res.error}`,
        });
      }
    });
  };

  return (
    <div className="space-y-3">
      {feedback && (
        <div
          role="status"
          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${
            feedback.type === "success"
              ? "border-positive-line bg-positive-soft text-positive"
              : "border-danger-line bg-danger-soft text-danger"
          }`}
        >
          {feedback.type === "success" ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
          <span>{feedback.message}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2.5">
        <button
          onClick={handleCreateNow}
          disabled={isPending}
          className="km-primary inline-flex items-center gap-2 rounded-lg bg-brand px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
          title="Generar una copia de seguridad inmediata cifrada con AES-256-GCM"
        >
          {isPending ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
          Hacer backup ahora
        </button>

        <Link
          href="/configuracion/backups?modal=restaurar"
          className="inline-flex items-center gap-2 rounded-lg border border-accent-line bg-accent-soft px-3.5 py-2 text-xs font-bold text-accent hover:bg-accent-soft/80"
          title="Abrir asistente de restauración de copias de seguridad"
        >
          <RotateCcw size={14} />
          Restaurar copia
        </Link>

        <Link
          href="/configuracion/backups"
          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-canvas px-3 py-2 text-xs font-semibold text-secondary hover:bg-subtle"
        >
          <ShieldCheck size={14} />
          Ver historial
        </Link>
      </div>
    </div>
  );
}
