"use client";

import { useActionState, useState } from "react";
import { PaymentEvidenceInput } from "@/modules/payments/evidence-input";
import { PrintBeforePayment } from "@/modules/payments/print-before-payment";
import { SubmitButton } from "@/components/forms/submit-button";
import { LoaderCircle } from "lucide-react";
import { usePreservedFormValues } from "@/components/forms/preserved-action-form";
import { activateApprovedLoan, type LoanActivationState } from "@/modules/financing/actions";

const initialState: LoanActivationState = {};

export function LoanActivationForm({ applicationId, loanId, idempotencyKey, initialAmount, today, profileComplete = true }: {
  applicationId: string;
  loanId: string;
  idempotencyKey: string;
  initialAmount: string;
  today: string;
  profileComplete?: boolean;
}) {
  const [method, setMethod] = useState("cash");
  const [state, formAction, pending] = useActionState(activateApprovedLoan, initialState);
  const { formRef, preserve } = usePreservedFormValues(state.error);
  return <form ref={formRef} action={formAction} onSubmit={preserve} className="mt-4 space-y-3">
    <input type="hidden" name="applicationId" value={applicationId}/>
    <input type="hidden" name="loanId" value={loanId}/>
    <input type="hidden" name="idempotencyKey" value={idempotencyKey}/>
    {!profileComplete && <p role="status" className="km-feedback" data-tone="warning">Completa y guarda los datos del expediente en el paso 1 para habilitar la entrega.</p>}
    <fieldset disabled={!profileComplete || pending} className="min-w-0 space-y-4 disabled:opacity-60">
    <div className="rounded-lg border border-accent-line bg-accent-soft p-3 text-xs leading-5 text-accent">
      Se registrará el inicial cotizado de <b>{initialAmount}</b>. La operación registra el pago, la declaración de firma del expediente y la entrega, y activa el financiamiento en una transacción.
    </div>
    <label className="block text-xs font-semibold text-secondary">Método de pago del inicial *
      <select required name="paymentMethod" value={method} onChange={(event) => setMethod(event.target.value)} className="km-input mt-1.5 w-full rounded-lg border border-field-border bg-surface px-3 py-2.5 text-sm font-normal">
        <option value="cash">Efectivo</option><option value="bank_transfer">Transferencia</option><option value="card">Tarjeta</option><option value="other">Otro</option>
      </select>
    </label>
    <label className="block text-xs font-semibold text-secondary">Referencia del pago
      <input name="paymentReference" maxLength={120} className="km-input mt-1.5 w-full rounded-lg border border-field-border px-3 py-2.5 text-sm font-normal" placeholder="Recibo o referencia bancaria"/>
    </label>
    <PrintBeforePayment loanId={loanId} type="down_payment" idempotencyKey={idempotencyKey}/>
    <PaymentEvidenceInput key={method} method={method} disabled={pending}/>
    <label className="block text-xs font-semibold text-secondary">Referencia del expediente definitivo firmado (contrato y acta) *
      <input required name="signedDocumentPath" minLength={3} maxLength={1000} autoComplete="off" className="km-input mt-1.5 w-full rounded-lg border border-field-border px-3 py-2.5 text-sm font-normal" placeholder="Identificador interno del expediente"/>
    </label>
    <label className="flex items-start gap-2 rounded-lg border border-warning-line bg-warning-soft p-3 text-xs leading-5 text-warning">
      <input required type="checkbox" name="contractEvidenceAttested" className="mt-1 accent-amber-700"/>
      <span>Confirmo que verifiqué que el contrato está firmado y documentado en el expediente indicado.</span>
    </label>
    <label className="flex items-start gap-2 rounded-lg border border-warning-line bg-warning-soft p-3 text-xs leading-5 text-warning"><input required type="checkbox" name="notarialActAttested" className="mt-1"/><span>Confirmo que verifiqué el acta notarial definitiva firmada y que está en el expediente indicado. El ejemplo provisional de KrediMax no es el documento firmado.</span></label>
    <p className="text-[11px] leading-5 text-muted">Esta referencia corresponde al contrato firmado y al acta definitiva archivados en el expediente. Se conserva la declaración del operador; este campo no sube archivos ni verifica su autenticidad notarial. La imagen del pago inicial se adjunta por separado.</p>
    <label className="block text-xs font-semibold text-secondary">Fecha de entrega del equipo *
      <input required type="date" name="deliveryDate" max={today} defaultValue={today} className="km-input mt-1.5 w-full rounded-lg border border-field-border px-3 py-2.5 text-sm font-normal"/>
    </label>
    <p className="text-[11px] text-muted">Responsable de la entrega: usuario de la sesión actual.</p>
    </fieldset>
    {state.error && <p role="alert" className="rounded-lg border border-danger-line bg-danger-soft p-3 text-xs leading-5 text-danger">{state.error}</p>}
    <SubmitButton disabled={pending || !profileComplete} className="km-primary w-full">
      {pending && <LoaderCircle size={15} className="motion-safe:animate-spin"/>}{pending ? "Registrando evidencia…" : "Confirmar inicial, firma y entrega"}
    </SubmitButton>
  </form>;
}
