"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { isIdleNavigation, navigationDestination, openFreshDocument, SLOW_NAVIGATION_MS } from "@/lib/navigation/recovery";

type PendingNavigation = { destination: string; from: string; slow: boolean };

export function NavigationRecovery() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams.toString()}`;
  const lastActivity = useRef(0);
  const freshDocument = useRef(false);
  const [pending, setPending] = useState<PendingNavigation | null>(null);

  // A completed route change removes the old transition before painting it.
  if (pending && pending.from !== routeKey) setPending(null);

  useEffect(() => {
    if (!lastActivity.current) lastActivity.current = Date.now();
    const activity = () => {
      const now = Date.now();
      if (isIdleNavigation(lastActivity.current, now)) freshDocument.current = true;
      lastActivity.current = now;
    };
    const restored = (event: PageTransitionEvent) => {
      if (event.persisted) freshDocument.current = true;
    };
    const visible = () => {
      if (document.visibilityState === "visible") activity();
    };
    const navigate = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement) || anchor.hasAttribute("download") || (anchor.target && anchor.target !== "_self")) return;
      const destination = navigationDestination(anchor.href, window.location.href);
      if (!destination) return;
      activity();
      if (!navigator.onLine) {
        event.preventDefault();
        event.stopPropagation();
        setPending({ destination, from: routeKey, slow: true });
        return;
      }
      setPending({ destination, from: routeKey, slow: false });
      if (freshDocument.current) {
        // After idle/restore, obtain new HTML, cookies and chunks rather than
        // reuse the old in-memory route. Do this only on an intentional link.
        event.preventDefault();
        event.stopPropagation();
        openFreshDocument(destination);
      }
    };
    document.addEventListener("pointerdown", activity, true);
    document.addEventListener("keydown", activity, true);
    document.addEventListener("visibilitychange", visible);
    document.addEventListener("click", navigate, true);
    window.addEventListener("pageshow", restored);
    return () => {
      document.removeEventListener("pointerdown", activity, true);
      document.removeEventListener("keydown", activity, true);
      document.removeEventListener("visibilitychange", visible);
      document.removeEventListener("click", navigate, true);
      window.removeEventListener("pageshow", restored);
    };
  }, [routeKey]);

  useEffect(() => {
    if (!pending || pending.slow) return;
    const destination = pending.destination;
    const fastFallback = window.setTimeout(() => {
      if (navigator.onLine) openFreshDocument(destination);
    }, 1500);
    const timer = window.setTimeout(() => setPending(current => current?.destination === destination ? { ...current, slow: true } : current), SLOW_NAVIGATION_MS);
    return () => {
      window.clearTimeout(fastFallback);
      window.clearTimeout(timer);
    };
  }, [pending]);

  if (!pending) return null;
  if (!pending.slow) return <div role="status" className="fixed bottom-5 right-5 z-[80] flex items-center gap-3 rounded-xl border border-line bg-surface px-5 py-4 text-sm font-medium text-secondary shadow-lg"><LoaderCircle size={19} className="motion-safe:animate-spin text-accent" aria-hidden/>Cargando página…</div>;
  return <section role="alert" aria-labelledby="slow-navigation-title" className="fixed inset-0 z-[80] grid place-items-center bg-canvas/95 px-5 backdrop-blur-sm">
    <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-7 shadow-sm"><span className="grid size-12 place-items-center rounded-xl bg-accent-soft text-accent"><RefreshCw size={23} aria-hidden/></span><h2 id="slow-navigation-title" className="mt-5 text-xl font-bold tracking-tight text-ink">La página está tardando en cargar</h2><p className="mt-3 text-sm leading-6 text-muted">Comprueba la conexión y vuelve a abrir esta sección. Si tu sesión venció, podrás iniciar sesión de nuevo.</p><div className="mt-6 flex flex-wrap gap-3"><button type="button" onClick={() => openFreshDocument(pending.destination)} className="km-primary"><RefreshCw size={16} aria-hidden/>Volver a intentar</button><button type="button" onClick={() => openFreshDocument("/")} className="km-secondary">Ir al inicio</button></div></div>
  </section>;
}

