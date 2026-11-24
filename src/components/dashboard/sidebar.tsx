"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";
import { ShieldCheck } from "lucide-react";
import { navigation } from "@/lib/navigation";
import { SidebarControl } from "@/components/dashboard/sidebar-control";
import { useNavigationAccess } from "@/components/dashboard/navigation-context";
import { BrandLogo } from "@/components/ui/brand-logo";

export function Sidebar() {
  const pathname = usePathname();
  const { can } = useNavigationAccess();
  return <aside className="km-sidebar fixed z-30 hidden flex-col lg:flex">
    <div className="km-sidebar-brand"><Link href="/" prefetch={false} className="flex min-w-0 items-center gap-2.5" aria-label="KrediMax inicio">
      <span aria-hidden className="km-brand-icon size-9 place-items-center rounded-xl bg-brand text-lg font-bold text-white shadow-sm">K</span>
      <BrandLogo/>
    </Link><SidebarControl/></div>
    <nav id="desktop-navigation" className="km-sidebar-scroll flex-1 overflow-y-auto px-3 pb-4" aria-label="Navegación principal">
      {navigation.filter((item) => can(item.permission)).map(({ label, href, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return <Fragment key={href}>
          {href === "/" && <p className="km-nav-caption !mt-1">Tu espacio de trabajo</p>}
          {href === "/reportes" && <p className="km-nav-caption">Administración</p>}
          {href === "/perfil" && <div className="mx-3 my-3 border-t border-line"/>}
          <Link href={href} prefetch={false} aria-label={label} title={label} aria-current={active ? "page" : undefined} className="km-nav-link mb-1">
            <Icon size={18} aria-hidden/><span className="km-nav-label truncate">{label}</span>
          </Link>
        </Fragment>;
      })}
    </nav>
    <div className="km-sidebar-footer mx-5 mb-5 border-t border-line pt-4 text-[11px] leading-5 text-muted">
      <p className="flex items-center gap-2 font-medium text-secondary"><ShieldCheck size={15} aria-hidden/>Plataforma de financiamiento</p>
      <p className="pl-[23px]">República Dominicana · DOP</p>
    </div>
  </aside>;
}
