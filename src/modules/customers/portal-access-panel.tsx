"use client";

import { useActionState, useState } from "react";
import { Check, Copy, KeyRound, LoaderCircle, ShieldCheck, Smartphone } from "lucide-react";
import {
  provisionCustomerPortalAccessAction,
  type CustomerPortalProvisionState,
} from "@/modules/customers/portal-actions";

const initialState: CustomerPortalProvisionState = null;

export function CustomerPortalAccessPanel({
  customerId,
  hasIdentityNumber,
  portalStatus,
  mustChangePassword,
  provisionedAt,
  defaultExecutiveName,
  defaultExecutiveWhatsapp,
  canWrite,
}: {
  customerId: string;
  hasIdentityNumber: boolean;
  portalStatus?: string | null;
  mustChangePassword?: boolean | null;
  provisionedAt?: string | null;
  defaultExecutiveName?: string | null;
  defaultExecutiveWhatsapp?: string | null;
  canWrite: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    provisionCustomerPortalAccessAction,
    initialState,
  );
  const [copied, setCopied] = useState(false);

  const isProvisioned = Boolean(portalStatus || state?.ok);

  async function copyPassword(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Ignore clipboard failures in restricted contexts
    }
  }

  return (
    <div className="mt-5 rounded-xl border border-line bg-subtle/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Smartphone size={16} className="text-accent shrink-0" aria-hidden />
          <h3 className="text-xs font-bold uppercase tracking-wider text-ink">
            App KrediMax Clientes
          </h3>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
            isProvisioned
              ? "bg-positive-soft text-positive"
              : "bg-warning-soft text-warning"
          }`}
        >
          <ShieldCheck size={12} aria-hidden />
          {isProvisioned ? "Cuenta activa" : "Sin activar"}
        </span>
      </div>

      <p className="mt-2 text-xs leading-5 text-muted">
        {isProvisioned
          ? "El cliente puede iniciar sesión en la app Android con su cédula. Si olvidó su clave, puedes generar una nueva contraseña temporal aleatoria."
          : "Genera el acceso móvil del cliente al activar su financiamiento. Se asigna una contraseña temporal aleatoria que deberá cambiar en su primer ingreso."}
      </p>

      {provisionedAt && !state?.ok && (
        <p className="mt-1.5 text-[11px] text-muted">
          Estado de clave:{" "}
          <b>{mustChangePassword ? "Cambio obligatorio pendiente" : "Actualizada por el cliente"}</b>
        </p>
      )}

      {state?.error && (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-danger-line bg-danger-soft p-2.5 text-xs text-danger"
        >
          {state.error}
        </p>
      )}

      {state?.ok && state.temporaryPassword && (
        <div
          role="status"
          className="mt-3 rounded-lg border border-positive-line bg-positive-soft p-3 text-xs text-ink"
        >
          <p className="font-bold text-positive">
            Credencial temporal generada (mostrar solo al titular)
          </p>
          <p className="mt-1 text-[11px] text-secondary">
            Cédula vinculada: <span className="font-mono font-semibold">{state.maskedCedula}</span>
          </p>
          <div className="mt-2 flex items-center justify-between gap-2 rounded-md border border-line bg-surface px-3 py-2">
            <code className="font-mono text-sm font-bold tracking-wider text-ink">
              {state.temporaryPassword}
            </code>
            <button
              type="button"
              onClick={() => copyPassword(state.temporaryPassword!)}
              className="inline-flex items-center gap-1 rounded-md bg-accent-soft px-2.5 py-1 text-[11px] font-semibold text-accent hover:opacity-90"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? "Copiada" : "Copiar"}
            </button>
          </div>
          <p className="mt-2 text-[11px] text-muted">
            Esta clave nunca utiliza dígitos de la cédula y obligará al cliente a crear una clave personal al ingresar.
          </p>
        </div>
      )}

      {canWrite && (
        <form action={formAction} className="mt-3 space-y-2.5">
          <input type="hidden" name="customerId" value={customerId} />
          <div>
            <label className="block text-[11px] font-semibold text-secondary">
              Ejecutivo de venta encargado (para pagos por WhatsApp)
            </label>
            <input
              type="text"
              name="executiveName"
              defaultValue={defaultExecutiveName ?? ""}
              placeholder="Ej. Carlos Méndez"
              className="mt-1 w-full rounded-md border border-field-border bg-surface px-2.5 py-1.5 text-xs"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-secondary">
              WhatsApp del Ejecutivo encargado
            </label>
            <input
              type="tel"
              name="executiveWhatsapp"
              defaultValue={defaultExecutiveWhatsapp ?? ""}
              placeholder="Ej. 18095550188"
              className="mt-1 w-full rounded-md border border-field-border bg-surface px-2.5 py-1.5 text-xs"
            />
          </div>
          <button
            type="submit"
            disabled={pending || !hasIdentityNumber}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-accent-line bg-surface px-3 py-2 text-xs font-semibold text-accent hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? (
              <LoaderCircle size={14} className="motion-safe:animate-spin" />
            ) : (
              <KeyRound size={14} />
            )}
            {pending
              ? "Generando clave segura…"
              : isProvisioned
                ? "Regenerar contraseña temporal"
                : "Activar cuenta móvil del cliente"}
          </button>
        </form>
      )}
    </div>
  );
}
