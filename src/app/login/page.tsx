import Link from "next/link";
import { ClipboardList, CreditCard, Users } from "lucide-react";
import { LoginForm, PasswordResetRequestForm } from "./login-forms";
import { AppearanceControl } from "@/components/ui/appearance-control";
import { BrandLogo } from "@/components/ui/brand-logo";

export default async function LoginPage({searchParams}:{searchParams:Promise<{error?:string;recover?:string}>}) {
  const {error,recover} = await searchParams;
  const messages:Record<string,string>={"not-configured":"Configura Supabase en .env.local para activar el acceso.",invalid:"Revisa el correo y la contraseña.",credentials:"No pudimos validar esas credenciales.","recovery-sent":"Si la cuenta existe, enviaremos un enlace para recuperar el acceso.","recovery-unavailable":"No se pudo enviar el enlace. Intenta más tarde o contacta al administrador.","recovery-invalid":"El enlace no es válido o ya venció. Solicita uno nuevo.","password-updated":"La contraseña se actualizó. Ya puedes iniciar sesión."};
  return <main id="main-content" tabIndex={-1} className="grid min-h-screen bg-canvas lg:grid-cols-[43%_57%]">
    <div className="fixed right-4 top-4 z-10"><AppearanceControl/></div>
    <aside className="relative hidden min-h-screen flex-col justify-center border-r border-line bg-surface px-12 py-14 lg:flex xl:px-16">
      <Link href="/" aria-label="KrediMax inicio" className="mb-16 inline-flex"><BrandLogo className="!w-[220px]"/></Link>
      <div><h2 className="max-w-md text-[46px] font-semibold leading-[1.1] tracking-[-1.8px] xl:text-[54px]">Tu cartera,<br/><span className="text-accent">bajo control.</span></h2><p className="mt-6 max-w-sm text-base leading-7 text-muted">Gestiona clientes, solicitudes y cobros desde un solo lugar.</p><ul className="mt-10 flex max-w-sm flex-col gap-5">{[{icon:Users,label:"Clientes y solicitudes"},{icon:ClipboardList,label:"Financiamientos y cuotas"},{icon:CreditCard,label:"Cobros y comprobantes"}].map(({icon:Icon,label})=><li key={label} className="flex items-center gap-4"><span className="grid size-11 place-items-center rounded-xl bg-accent-soft text-accent"><Icon size={21} strokeWidth={1.7} aria-hidden/></span><span className="text-sm text-secondary">{label}</span></li>)}</ul></div>
    </aside>
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10 sm:px-8"><section className="km-panel w-full max-w-[480px] p-6 sm:p-10"><Link href="/" aria-label="KrediMax inicio" className="flex justify-center"><BrandLogo className="!w-[220px] max-w-full"/></Link><h1 className="mt-8 text-center text-[26px] font-bold tracking-tight text-ink sm:text-[28px]">{recover === "1" ? "Recuperar acceso" : "Bienvenido a KrediMax"}</h1><p className="mt-2 text-center text-sm leading-6 text-muted">{recover === "1" ? "Te enviaremos un enlace si la cuenta existe." : "Ingresa a tu espacio de trabajo."}</p>{error&&messages[error]&&<p role={error==="recovery-sent"||error==="password-updated"?"status":"alert"} className="mt-5 rounded-lg bg-warning-soft p-3 text-sm text-warning">{messages[error]}</p>}{recover==="1" ? <PasswordResetRequestForm/> : <><LoginForm/><Link href="/login?recover=1" className="mt-5 block py-2 text-center text-sm font-medium text-accent hover:underline">¿Olvidaste tu contraseña?</Link></>}</section><p className="mt-8 text-center text-xs leading-5 text-muted">Plataforma de financiamiento · República Dominicana</p><Link href="/privacidad" className="mt-2 text-xs text-accent hover:underline">Privacidad</Link></div>
  </main>;
}
