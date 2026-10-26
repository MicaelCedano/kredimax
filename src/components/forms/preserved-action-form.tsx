"use client";

import { useActionState, useEffect, useRef, type FormEvent, type ReactNode } from "react";
import { snapshotFormData, type PreservedValues } from "@/components/forms/preserved-values";
import { Feedback } from "@/components/ui/feedback";

export type PreservedFormState = { state: string } | null;
export type PreservedFormAction = (previousState: PreservedFormState, formData: FormData) => Promise<PreservedFormState>;

type Props = {
  action: PreservedFormAction;
  className?: string;
  children: ReactNode;
  messages: Record<string, string>;
  preserveFields?: string[];
};

export function PreservedActionForm({ action, className, children, messages, preserveFields }: Props) {
  const [state, formAction, pending] = useActionState(action, null);
  const { formRef, preserve } = usePreservedFormValues(state, preserveFields);

  return <form ref={formRef} action={formAction} onSubmit={(event) => { if (pending) { event.preventDefault(); return; } preserve(event); }} className={className} aria-busy={pending}>
    {children}
    {state?.state && <Feedback tone="error">{messages[state.state] ?? "No se pudo guardar. Tus datos siguen en el formulario; revisa los campos e inténtalo otra vez."}</Feedback>}
  </form>;
}

export function usePreservedFormValues(state: unknown, preserveFields?: string[]) {
  const formRef = useRef<HTMLFormElement>(null);
  const submittedValues = useRef<PreservedValues | null>(null);

  function preserve(event: FormEvent<HTMLFormElement>) {
    submittedValues.current = snapshotFormData(new FormData(event.currentTarget), preserveFields);
  }

  useEffect(() => {
    const form = formRef.current;
    const values = submittedValues.current;
    if (state == null || !form || !values) return;

    for (const [name, entries] of Object.entries(values)) {
      const field = form.elements.namedItem(name);
      if (field instanceof RadioNodeList) {
        for (const control of Array.from(field)) {
          if (control instanceof HTMLInputElement && (control.type === "checkbox" || control.type === "radio")) {
            control.checked = entries.includes(control.value);
          }
        }
      } else if (field instanceof HTMLInputElement && (field.type === "checkbox" || field.type === "radio")) {
        field.checked = entries.includes(field.value);
      } else if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement) {
        field.value = entries[0] ?? "";
      }
    }
  }, [state]);

  return { formRef, preserve };
}
