import Link from "next/link";
import { SubmitButton } from "@/components/forms/submit-button";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { updatePassword } from "@/app/login/actions";
import { hasRecentRecovery } from "@/lib/auth/recovery-session";

export default async function RecoverPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  let authenticated = false;
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    const { data: claims } = await supabase.auth.getClaims();
    authenticated = Boolean(data.user) && hasRecentRecovery(claims?.claims);
  } catch {
    redirect("/login?error=not-configured");
  }
  if (!authenticated) redirect("/login?error=recovery-invalid");
  return <main id="main-content" tabIndex={-1} className="grid min-h-screen place-items-center bg-canvas px-4"><section className="km-panel w-full max-w-[420px] rounded-2xl border border-line bg-surface p-7 shadow-sm"><Link href="/" className="text-[24px] font-bold tracking-tight text-ink">Kredi<span className="text-cyan-500">Max</span></Link><h1 className="mt-7 text-xl font-bold text-ink">Crear una contraseña nueva</h1><p className="mt-1 text-sm text-muted">Usa al menos 12 caracteres.</p>{error && <p role="alert" className="mt-4 rounded-lg bg-warning-soft p-3 text-sm text-warning">{error === "invalid" ? "Las contraseñas deben coincidir y tener 12 caracteres o más." : "No se pudo actualizar la contraseña. Solicita un enlace nuevo."}</p>}<form action={updatePassword} className="mt-6 space-y-4"><label className="block text-sm font-medium text-secondary">Contraseña nueva<input required minLength={12} maxLength={256} autoComplete="new-password" type="password" name="password" className="km-input mt-1.5 w-full rounded-lg border border-field-border px-3 py-2.5"/></label><label className="block text-sm font-medium text-secondary">Confirmar contraseña<input required minLength={12} maxLength={256} autoComplete="new-password" type="password" name="confirmation" className="km-input mt-1.5 w-full rounded-lg border border-field-border px-3 py-2.5"/></label><SubmitButton className="km-primary w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white">Actualizar contraseña</SubmitButton></form></section></main>;
}
