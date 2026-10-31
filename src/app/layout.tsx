import type { Metadata } from "next";
import { Suspense } from "react";
import { NavigationRecovery } from "@/components/navigation/navigation-recovery";
import { AppearanceSync } from "@/components/ui/appearance-control";
import { appearanceScript } from "@/lib/appearance";
import { NavigationProvider } from "@/components/dashboard/navigation-context";
import "./globals.css";

export const metadata: Metadata = {
  title: "KrediMax | Financiamiento de dispositivos",
  description: "Gestión de cartera, cobros y dispositivos financiados.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: appearanceScript }}/><script dangerouslySetInnerHTML={{ __html: "try{document.documentElement.dataset.sidebar=localStorage.getItem('kredimax.sidebar.v1')==='collapsed'?'collapsed':'expanded'}catch(e){}" }}/></head><body><AppearanceSync/><a href="#main-content" className="km-skip-link">Saltar al contenido</a><Suspense fallback={null}><NavigationRecovery/></Suspense><NavigationProvider>{children}</NavigationProvider></body></html>;
}
