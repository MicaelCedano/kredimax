import Link from "next/link";
import { BrandLogo } from "./brand-logo";

export function PublicInformationPage({ title, children }: Readonly<{ title: string; children: React.ReactNode }>) {
  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-canvas px-4 py-10 sm:px-8 sm:py-16">
      <article className="km-panel mx-auto max-w-2xl p-6 sm:p-10">
        <Link href="/acerca" aria-label="Acerca de KrediMax" className="inline-flex max-w-full">
          <BrandLogo className="!w-[170px] max-w-full"/>
        </Link>
        <h1 className="mt-7 text-2xl font-bold tracking-tight text-ink sm:text-3xl">{title}</h1>
        <div className="mt-5 space-y-5 text-sm leading-7 text-secondary [&_h2]:mb-1 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-ink">
          {children}
        </div>
        <nav aria-label="Información de KrediMax" className="mt-7 flex flex-wrap gap-x-5 gap-y-3 border-t border-line pt-5 text-sm font-medium text-accent">
          <Link href="/privacidad" className="hover:underline">Privacidad</Link>
          <Link href="/condiciones" className="hover:underline">Condiciones de uso</Link>
          <Link href="/login" className="hover:underline">Iniciar sesión</Link>
        </nav>
      </article>
    </main>
  );
}
