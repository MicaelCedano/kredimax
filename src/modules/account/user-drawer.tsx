"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X, type LucideIcon } from "lucide-react";

export function UserDrawer({ title, description, icon: Icon, onDismiss, children }: {
  title: string; description: string; icon: LucideIcon; onDismiss: () => void; children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement;
    element?.showModal();
    return () => {
      element?.close();
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);

  function dismiss() {
    if (dialog.current?.querySelector('form[data-pending="true"]')) return;
    onDismiss();
  }

  return <dialog ref={dialog} aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
    className="users-drawer fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-dvh w-full max-w-[540px] border-0 bg-surface p-0 text-ink shadow-2xl backdrop:bg-[#07182f]/35 backdrop:backdrop-blur-[2px] sm:my-3 sm:mr-3 sm:h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-1.5rem)] sm:rounded-2xl"
    onCancel={event => { event.preventDefault(); dismiss(); }}
    onClick={event => { if (event.target === event.currentTarget) {
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dismiss();
    } }}>
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-start gap-3 border-b border-line px-5 py-6 sm:px-7">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent"><Icon size={24} strokeWidth={1.7} aria-hidden/></span>
        <div className="min-w-0 flex-1"><h2 id={`${id}-title`} className="text-xl font-bold tracking-[-.5px] text-ink">{title}</h2><p id={`${id}-description`} className="mt-1 text-sm leading-5 text-muted">{description}</p></div>
        <button type="button" onClick={dismiss} aria-label="Cerrar panel" className="grid size-9 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-soft hover:text-ink"><X size={20} aria-hidden/></button>
      </header>
      {children}
    </div>
  </dialog>;
}
