"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/forms/submit-button";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Factor = { id: string; label: string };

export default function MfaSetup({ verifiedFactors, pendingFactors }: { verifiedFactors: Factor[]; pendingFactors: Factor[] }) {
  const router = useRouter();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const supabase = createSupabaseBrowserClient();

  async function beginEnrollment() {
    setBusy(true); setError("");
    const { data, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "KrediMax Administrador" });
    setBusy(false);
    if (enrollError || !data?.totp) { setError("No se pudo iniciar la configuración. Verifica que MFA TOTP esté habilitado en Supabase Auth."); return; }
    setFactorId(data.id); setQr(data.totp.qr_code); setSecret(data.totp.secret);
  }

  async function removePendingFactors() {
    setBusy(true); setError("");
    for (const factor of pendingFactors) {
      const { error: removeError } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
      if (removeError) { setError("No se pudo retirar la configuración incompleta. Intenta de nuevo antes de registrar otro factor."); setBusy(false); return; }
    }
    setRestarting(true); setBusy(false);
  }

  async function verify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const selectedFactor = factorId ?? verifiedFactors.find((factor) => factor.id === event.currentTarget.dataset.factorId)?.id;
    if (!selectedFactor) return;
    setBusy(true); setError("");
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: selectedFactor, code: code.replace(/\s/g, "") });
    setBusy(false);
    if (verifyError) { setError("El código no es válido o venció. Revisa tu aplicación autenticadora e intenta de nuevo."); return; }
    router.replace("/"); router.refresh();
  }

  if (verifiedFactors.length) return <div className="mt-6 space-y-4">
    <form onSubmit={verify} data-factor-id={verifiedFactors[0].id} className="space-y-4">
      <label className="block text-sm font-medium text-secondary">Código de tu aplicación autenticadora
        <input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,8}" minLength={6} maxLength={8} value={code} onChange={(event) => setCode(event.target.value)} className="km-input mt-1.5 w-full rounded-lg border border-field-border px-3 py-2.5 text-lg tracking-[0.3em]" />
      </label>
      <SubmitButton disabled={busy} className="km-primary rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{busy ? "Verificando…" : "Verificar y continuar"}</SubmitButton>
    </form>
    {verifiedFactors.length > 1 && <p className="text-xs text-muted">Se usará el factor «{verifiedFactors[0].label}».</p>}
    {error && <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">{error}</p>}
  </div>;

  return <div className="mt-6 space-y-4">
    {factorId ? <>
      <p className="text-sm font-semibold text-ink">1. Añade KrediMax a tu aplicación autenticadora.</p>
      {qr && <Image alt="Código QR de configuración TOTP" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr)}`} width={192} height={192} unoptimized className="h-48 w-48 rounded border border-line p-2" />}
      <details><summary className="cursor-pointer text-sm font-semibold text-accent">No puedo escanear el código</summary><p className="mt-2 break-all rounded bg-subtle p-3 font-mono text-sm" aria-label="Clave secreta TOTP">{secret}</p></details>
      <p className="text-sm font-semibold text-ink">2. Escribe el código de seis dígitos generado por la aplicación.</p>
      <form onSubmit={verify} className="space-y-4"><label className="block text-sm font-medium text-secondary">Código de verificación<input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,8}" minLength={6} maxLength={8} value={code} onChange={(event) => setCode(event.target.value)} className="km-input mt-1.5 w-full rounded-lg border border-field-border px-3 py-2.5 text-lg tracking-[0.3em]" /></label><SubmitButton disabled={busy} className="km-primary rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{busy ? "Verificando…" : "Activar verificación"}</SubmitButton></form>
    </> : pendingFactors.length && !restarting ? <>
      <p className="rounded-lg bg-warning-soft p-3 text-sm text-warning">Hay una configuración TOTP incompleta ({pendingFactors.map((factor) => factor.label).join(", ")}). Retírala para reiniciar el registro. Esto solo elimina factores todavía no verificados.</p>
      <button disabled={busy} onClick={removePendingFactors} className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{busy ? "Preparando…" : "Retirar configuración incompleta"}</button>
    </> : <button disabled={busy} onClick={beginEnrollment} className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{busy ? "Preparando…" : "Configurar aplicación autenticadora"}</button>}
    {error && <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">{error}</p>}
    <p className="text-xs leading-5 text-muted">Guarda el factor en un dispositivo bajo tu control. MFA de recuperación y códigos de respaldo no están configurados.</p>
  </div>;
}
