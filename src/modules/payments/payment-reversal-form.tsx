"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/forms/submit-button";
import { usePreservedFormValues } from "@/components/forms/preserved-action-form";
import { reverseLoanPayment } from "@/modules/payments/actions";
import { ActionDialog } from "@/components/ui/action-dialog";

const initialState = null;

export function PaymentReversalDialog({ paymentId, customerName }: { paymentId: string; customerName: string }) {
  return <ActionDialog trigger="Revertir" title="Revertir pago" description={customerName} destructive><p className="mb-5 rounded-lg border border-warning-line bg-warning-soft p-3 text-xs leading-5 text-warning">El importe dejará de contar como pagado y se restaurará el saldo de las cuotas. El pago original permanecerá en el historial.</p><PaymentReversalForm paymentId={paymentId} expanded/></ActionDialog>;
}

export function PaymentReversalForm({ paymentId, expanded = false }: { paymentId: string; expanded?: boolean }) {
  const [state, action, pending] = useActionState(reverseLoanPayment, initialState);
  const { formRef, preserve } = usePreservedFormValues(state);
  const reasonInput = <input name="reason" aria-label="Motivo del reverso" required minLength={5} maxLength={500} placeholder={expanded ? "Describe por qué se revierte este pago" : "Motivo"} autoFocus={expanded} className={`km-input ${expanded ? "km-input mt-2 w-full" : "min-w-0 flex-1 rounded border border-field-border px-2 py-1.5"}`}/>;
  return <form ref={formRef} action={action} onSubmit={preserve} className={expanded ? "space-y-4" : "flex min-w-48 flex-wrap items-center gap-2"}>
    <input type="hidden" name="paymentId" value={paymentId}/>
    {expanded ? <label className="block text-xs font-semibold text-secondary">Motivo del reverso{reasonInput}</label> : reasonInput}
    <SubmitButton disabled={pending} className={expanded ? "inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-rose-700 px-4 py-3 text-sm font-semibold text-white hover:bg-rose-800 disabled:opacity-60" : "rounded border border-danger-line px-2.5 py-1.5 font-semibold text-danger disabled:opacity-60"}>{pending ? "Revirtiendo…" : expanded ? "Confirmar reverso" : "Revertir"}</SubmitButton>
    {state?.state && <span role="alert" className="basis-full text-xs text-danger">{state.state === "cash-closed" ? "La caja de este cobro ya está cerrada para hoy. No se registró el reverso." : state.state === "reversal-invalid" ? "Escribe un motivo de al menos cinco caracteres." : state.state === "forbidden" ? "No tienes permiso para reversar este pago." : "No se pudo registrar el reverso; el motivo quedó en el formulario."}</span>}
  </form>;
}
