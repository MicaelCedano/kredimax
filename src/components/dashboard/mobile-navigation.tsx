"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { navigation } from "@/lib/navigation";
import { AppearanceControl } from "@/components/ui/appearance-control";
import { SearchBox } from "@/components/dashboard/search-box";
import { containDialogFocus } from "@/lib/ui/dialog-focus";

type TenantChoice = { id: string; name: string; branchId: string | null; branchName: string | null; role: string };

export function MobileNavigation({ tenantChoices, selectedTenant, selectedContext, onTenantChange }: {
  tenantChoices: TenantChoice[];
  selectedTenant: string;
  selectedContext: { organization: string; branch: string; role: string };
  onTenantChange: (tenantId: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const id = useId();
  const pathname = usePathname();
  useEffect(() => { dialog.current?.close(); }, [pathname]);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => { if (desktop.matches) dialog.current?.close(); };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);
  const close = () => dialog.current?.close();
  return <>
    <button type="button" className="km-icon-button km-mobile-trigger" onClick={() => { dialog.current?.showModal(); setOpen(true); }} aria-label="Abrir navegación" aria-haspopup="dialog" aria-controls={id} aria-expanded={open}><Menu size={21}/></button>
    <dialog ref={dialog} id={id} aria-labelledby={`${id}-title`} className="km-mobile-dialog" onKeyDown={containDialogFocus} onClose={() => setOpen(false)} onClick={(event) => { if (event.target === event.currentTarget) { const box=event.currentTarget.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) close(); } }}>
      <div className="mb-5 flex items-center justify-between gap-3"><Link onClick={close} href="/" className="text-2xl font-bold tracking-tight text-ink" id={`${id}-title`}>Kredi<span className="text-accent">Max</span></Link><button type="button" onClick={close} className="km-icon-button" aria-label="Cerrar navegación"><X size={21}/></button></div>
      <SearchBox compact/>
      <section aria-label="Contexto de sesión" className="my-4 rounded-2xl border border-line bg-subtle p-4 text-xs leading-5 text-secondary">
        <p className="font-semibold text-ink">{selectedContext.organization}</p><p>{selectedContext.branch}</p><p className="text-muted">{selectedContext.role}</p>
        {tenantChoices.length > 1 && <label className="mt-3 block font-semibold">Cambiar empresa<select aria-label="Empresa activa" value={selectedTenant} onChange={(event) => onTenantChange(event.target.value)} className="km-input mt-2 w-full"><option value="">Selecciona empresa</option>{tenantChoices.map((choice) => <option key={choice.id} value={choice.id}>{choice.name} · {choice.branchName}</option>)}</select></label>}
      </section>
      <nav aria-label="Navegación móvil" className="flex-1 pb-5">{navigation.map(({ label, href, icon: Icon }) => <Link key={href} href={href} prefetch={false} aria-current={(href === "/" ? pathname === "/" : pathname.startsWith(href)) ? "page" : undefined} onClick={close} className="km-nav-link mb-1"><Icon size={18} aria-hidden/>{label}</Link>)}</nav>
      <AppearanceControl expanded/>
    </dialog>
  </>;
}

