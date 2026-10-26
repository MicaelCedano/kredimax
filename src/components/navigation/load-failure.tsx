"use client";

import { RefreshCw, TriangleAlert } from "lucide-react";
import { openFreshDocument } from "@/lib/navigation/recovery";

export function LoadFailure({ retry }: { retry: () => void }) {
  return <main id="main-content" tabIndex={-1} className="grid min-h-screen place-items-center bg-canvas px-5"><section className="km-panel w-full max-w-md rounded-2xl border border-line bg-surface p-7 shadow-sm"><span className="grid size-12 place-items-center rounded-xl bg-warning-soft text-warning"><TriangleAlert size={24} aria-hidden/></span><h1 className="mt-5 text-2xl font-bold tracking-tight text-ink">No se pudo cargar esta página</h1><p className="mt-3 text-sm leading-6 text-muted">La carga se interrumpió. Puedes volver a intentar o abrir una copia nueva de la página.</p><div className="mt-6 flex flex-wrap gap-3"><button type="button" onClick={retry} className="km-primary"><RefreshCw size={16} aria-hidden/>Reintentar</button><button type="button" onClick={() => openFreshDocument(window.location.href)} className="km-secondary">Recargar página</button></div><button type="button" onClick={() => openFreshDocument("/")} className="mt-5 inline-block text-sm font-medium text-accent">Volver al inicio</button></section></main>;
}

