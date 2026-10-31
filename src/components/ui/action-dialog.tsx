"use client";

import { useId, useRef, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { containDialogFocus } from "@/lib/ui/dialog-focus";

const subscribe = () => () => undefined;
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function ActionDialog({ trigger, title, description, children, destructive = false }: {
  trigger: string; title: string; description?: string; children: ReactNode; destructive?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  const hydrated = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  return <>
    <button type="button" aria-haspopup="dialog" aria-controls={id} onClick={() => dialog.current?.showModal()}
      className={`inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${destructive ? "border-line text-secondary hover:border-danger-line hover:bg-danger-soft hover:text-danger" : "border-accent-line bg-surface text-accent hover:border-accent hover:bg-accent-soft"}`}>{trigger}</button>
    {hydrated && createPortal(<dialog ref={dialog} id={id} onKeyDown={containDialogFocus} aria-labelledby={`${id}-title`} aria-describedby={description ? `${id}-description` : undefined}
      className="km-dialog m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-slate-950/40"
      onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <div className="p-5 sm:p-7">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div><h2 id={`${id}-title`} className="text-xl font-bold tracking-tight text-ink">{title}</h2>{description && <p id={`${id}-description`} className="mt-1.5 text-sm leading-6 text-muted">{description}</p>}</div>
          <button type="button" aria-label="Cerrar ventana" onClick={() => dialog.current?.close()} className="-mr-1 -mt-1 grid h-11 w-11 shrink-0 place-items-center rounded-lg text-muted hover:bg-soft hover:text-secondary"><X size={20}/></button>
        </div>
        {children}
      </div>
    </dialog>, document.body)}
  </>;
}


