"use client";
import { PaymentEvidenceInput } from "@/modules/payments/evidence-input";

import { useActionState, useState } from "react";
import { MoneyInput } from "@/components/forms/money-input";
import { SubmitButton } from "@/components/forms/submit-button";
import { usePreservedFormValues } from "@/components/forms/preserved-action-form";
import { recordLoanPayment } from "@/modules/payments/actions";
import { ActionDialog } from "@/components/ui/action-dialog";
import { formatDop } from "@/lib/format-money";
import { ArrowRight, ShieldCheck } from "lucide-react";

const messages: Record<string, string> = {
  "evidence-required": "Adjunta el voucher de transferencia o la foto del recibo firmado para efectivo.",
  "signed-receipt-required": "Confirma que la foto muestra el recibo firmado por el cliente.",
  "evidence-invalid": "Selecciona una imagen JPG, PNG o WebP válida y legible de hasta 8 MB.",
  "evidence-conflict": "Este envío ya tiene otra evidencia. Actualiza la página y revisa el comprobante registrado.",
  forbidden: "Tu rol no puede registrar pagos.",
  invalid: "Revisa el monto, método y referencia del pago.",
  "exceeds-balance": "El monto supera el saldo pendiente del financiamiento.",
  "save-error": "No se pudo guardar el pago. Corrige el dato indicado y vuelve a intentar.",
};

type PaymentFormProps = {
  loanId: string;
  balance: string;
  paymentLimit: string;
  idempotencyKey: string;
  amount?: string;
  paymentMethod?: string;
  reference?: string;
  expanded?: boolean;
};

export function PaymentDialog({ customerName, dueDate, ...props }: PaymentFormProps & { customerName: string; dueDate: string }) {
  return <ActionDialog trigger="Registrar pago" title="Registrar pago" description="Revisa el monto y el método antes de confirmar.">
    <div className="mb-6 rounded-xl border border-line bg-subtle p-4">
      <p className="font-semibold text-ink">{customerName}</p>
      <p className="mt-1 text-xs text-muted">Cuota con vencimiento el {new Intl.DateTimeFormat("es-DO", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${dueDate}T00:00:00Z`))}</p>
      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-3 text-xs"><div><dt className="text-muted">Saldo de esta cuota</dt><dd className="mt-1 font-bold tabular-nums text-ink">{formatDop(props.balance)}</dd></div><div><dt className="text-muted">Saldo del financiamiento</dt><dd className="mt-1 font-bold tabular-nums text-ink">{formatDop(props.paymentLimit)}</dd></div></dl>
    </div>
    <PaymentForm {...props} expanded/>
  </ActionDialog>;
}

export function PaymentForm({ loanId, balance, paymentLimit, idempotencyKey, amount, paymentMethod, reference, expanded = false }: PaymentFormProps) {
  const [state, action, pending] = useActionState(recordLoanPayment, null);
  const [method, setMethod] = useState(paymentMethod ?? "cash");
  const { formRef, preserve } = usePreservedFormValues(state);
  const inputClass = expanded ? "km-input mt-2 w-full" : "w-full min-w-0 rounded border border-field-border px-2 py-2 md:w-24 md:py-1.5";
  const amountInput = <MoneyInput name="amount" aria-label="Monto del pago" type="number" min="0.01" max={paymentLimit} step="0.01" defaultValue={amount ?? balance} required autoFocus={expanded} className={`km-input ${inputClass}`}/>;
  const methodInput = <select name="paymentMethod" aria-label="Método de pago" value={method} onChange={(event) => setMethod(event.target.value)} className={`km-input ${expanded ? inputClass : "w-full min-w-0 rounded border border-field-border px-2 py-2 md:w-auto md:py-1.5"}`}><option value="cash">Efectivo</option><option value="bank_transfer">Transferencia</option><option value="card">Tarjeta</option><option value="other">Otro</option></select>;
  const referenceInput = <input name="reference" aria-label="Referencia del pago" maxLength={120} placeholder={expanded ? "Número de recibo o referencia bancaria" : "Referencia"} defaultValue={reference ?? ""} className={`km-input ${expanded ? inputClass : "w-full min-w-0 rounded border border-field-border px-2 py-2 md:w-24 md:py-1.5"}`}/>;
  return <form ref={formRef} action={action} onSubmit={preserve} className={expanded ? "space-y-4" : "grid w-full min-w-0 gap-2 md:flex md:flex-wrap md:items-center"}>
    <input type="hidden" name="loanId" value={loanId}/>
    <input type="hidden" name="idempotencyKey" value={idempotencyKey}/>
    {expanded ? <><label className="block text-xs font-semibold text-secondary">Monto a recibir (RD$){amountInput}</label><label className="block text-xs font-semibold text-secondary">Método de pago{methodInput}</label><label className="block text-xs font-semibold text-secondary">Referencia <span className="font-normal text-muted">· opcional</span>{referenceInput}</label><p className="flex gap-2 rounded-lg bg-accent-soft p-3 text-xs leading-5 text-accent"><ShieldCheck size={16} className="mt-0.5 shrink-0"/>El pago se aplicará primero a las cuotas más antiguas. Puedes abonar o cubrir varias cuotas, hasta el saldo del financiamiento.</p></> : <>{amountInput}{methodInput}{referenceInput}</>}
    <PaymentEvidenceInput key={method} method={method} disabled={pending}/>
    <SubmitButton disabled={pending} className={expanded ? "km-primary w-full" : "w-full rounded bg-brand px-2.5 py-2 font-semibold text-white disabled:cursor-wait disabled:opacity-60 md:w-auto md:py-1.5"}>{pending ? "Guardando…" : expanded ? "Confirmar pago" : "Registrar"}{expanded && <ArrowRight size={16}/>}</SubmitButton>
    {state?.state && <span role="alert" className="text-xs text-danger md:basis-full">{messages[state.state] ?? "No se pudo completar el pago."}</span>}
    <span className="sr-only">Se aplicará primero a las cuotas más antiguas.</span>
  </form>;
}
