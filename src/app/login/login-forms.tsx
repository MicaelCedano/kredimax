"use client";

import Link from "next/link";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionState, useState } from "react";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { usePreservedFormValues } from "@/components/forms/preserved-action-form";
import { requestPasswordReset, signIn } from "./actions";

const loginMessages: Record<string, string> = {
  "not-configured": "El acceso real aún no está configurado.",
  invalid: "Escribe un usuario o correo y una contraseña válidos.",
  credentials: "No se pudo iniciar sesión. Verifica tus datos e inténtalo otra vez.",
  unavailable: "No se pudo conectar con el servicio de autenticación. Verifica que Supabase local esté iniciado.",
};

export function LoginForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [state, action, pending] = useActionState(signIn, null);
  const { formRef, preserve } = usePreservedFormValues(state, ["identifier"]);
  return <form ref={formRef} action={action} onSubmit={preserve} className="mt-6 space-y-4">
    <label className="block text-sm font-medium text-secondary">Usuario o correo electrónico<input required type="text" name="identifier" autoComplete="username" maxLength={254} className="km-input mt-1.5 w-full rounded-lg border border-field-border px-3 py-2.5 text-sm"/></label>
    <div><label htmlFor="login-password" className="block text-sm font-medium text-secondary">Contraseña</label><div className="relative mt-1.5"><input id="login-password" required type={showPassword ? "text" : "password"} name="password" autoComplete="current-password" maxLength={256} className="km-input w-full pr-12"/><button type="button" aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"} aria-pressed={showPassword} onClick={()=>setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-lg text-muted hover:text-accent">{showPassword ? <EyeOff size={18} aria-hidden/> : <Eye size={18} aria-hidden/>}</button></div></div>
    {state?.state && <p role="alert" className="rounded-lg bg-warning-soft p-3 text-sm text-warning">{loginMessages[state.state] ?? "No se pudo iniciar sesión."}</p>}
    <SubmitButton disabled={pending} className="km-primary w-full">{pending ? "Verificando…" : "Entrar"}<ArrowRight size={16} aria-hidden/></SubmitButton>
  </form>;
}

export function PasswordResetRequestForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, null);
  const { formRef, preserve } = usePreservedFormValues(state, ["identifier"]);
  return <form ref={formRef} action={action} onSubmit={preserve} className="mt-6 space-y-4">
    <label className="block text-sm font-medium text-secondary">Usuario o correo electrónico<input required type="text" name="identifier" autoComplete="username" maxLength={254} className="km-input mt-1.5 w-full rounded-lg border border-field-border px-3 py-2.5 text-sm"/></label>
    {state?.state && <p role="alert" className="rounded-lg bg-warning-soft p-3 text-sm text-warning">{state.state === "invalid" ? "Escribe un usuario o correo electrónico válido." : state.state === "not-configured" ? "La recuperación aún no está configurada." : "No se pudo solicitar el enlace. El usuario quedó en el formulario; inténtalo más tarde."}</p>}
    <SubmitButton disabled={pending} className="km-primary w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{pending ? "Solicitando…" : "Enviar enlace de recuperación"}</SubmitButton>
    <Link href="/login" className="block text-center text-sm text-accent">Volver al inicio de sesión</Link>
  </form>;
}
