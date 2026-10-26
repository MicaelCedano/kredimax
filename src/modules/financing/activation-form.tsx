"use client";

import { useActionState, useState } from "react";
import { PaymentEvidenceInput } from "@/modules/payments/evidence-input";
import { SubmitButton } from "@/components/forms/submit-button";
import { LoaderCircle } from "lucide-react";
import { usePreservedFormValues } from "@/components/forms/preserved-action-form";
import { activateApprovedLoan, type LoanActivationState } from "@/modules/financing/actions";

const initialState: LoanActivationState = {};

export function LoanActivationForm({ applicationId, loanId, idempotencyKey, initialAmount, today }: {
  applicationId: string;
  loanId: string;
  idempotencyKey: string;
  initialAmount: string;
  today: string;
}) {
  const [method, setMethod] = useState("cash");
  const [state, formAction, pending] = useActionState(activateApprovedLoan, initialState);
  const { formRef, preserve } = usePreservedFormValues(state.error);
  return <form ref={formRef} action={formAction} onSubmit={preserve} className="mt-4 space-y-3">
    <input type="hidden" name="applicationId" value={applicationId}/>
    <input type="hidden" name="loanId" value={loanId}/>
    <input type="hidden" name="idempotencyKey" value={idempotencyKey}/>
    <div className="rounded-lg border border-accent-line bg-accent-soft p-3 text-xs leading-5 text-accent">
      Se registrará el inicial cotizado de <b>{initialAmount}</b>. La operación registra el pago, firma/entrega y activación en una transacción.
    </div>
    <label className="block text-xs font-semibold text-secondary">Método de pago del inicial *
      <select required name="paymentMethod" value={method} onChange={(event) => setMethod(event.target.value)} className="km-input mt-1.5 w-full rounded-lg border border-field-border bg-surface px-3 py-2.5 text-sm font-normal">
        <option value="cash">Efectivo</option><option value="bank_transfer">Transferencia</option><option value="card">Tarjeta</option><option value="other">Otro</option>
      </select>
    </label>
    <label className="block text-xs font-semibold text-secondary">Referencia del pago
      <input name="paymentReference" maxLength={120} className="km-input mt-1.5 w-full rounded-lg border border-field-border px-3 py-2.5 text-sm font-normal" placeholder="Recibo o referencia bancaria"/>
    </label>
    <PaymentEvidenceInput key={method} method={method} disabled={pending}/>
    <label className="block text-xs font-semibold text-secondary">Referencia del documento firmado *
      <input required name="signedDocumentPath" minLength={3} maxLength={1000} autoComplete="off" className="km-input mt-1.5 w-full rounded-lg border border-field-border px-3 py-2.5 text-sm font-normal" placeholder="Identificador interno del expediente"/>
    </label>
    <label className="flex items-start gap-2 rounded-lg border border-warning-line bg-warning-soft p-3 text-xs leading-5 text-warning">
      <input required type="checkbox" name="contractEvidenceAttested" className="mt-1 accent-amber-700"/>
      <span>Confirmo que verifiqué que el contrato está firmado y documentado en el expediente indicado.</span>
    </label>
    <p className="-mt-2 text-[11px] leading-5 text-warning">Esta referencia corresponde al contrato firmado. La imagen del pago inicial se adjunta por separado en la evidencia del pago.</p>
    <label className="block text-xs font-semibold text-secondary">Fecha de entrega del equipo *
      <input required type="date" name="deliveryDate" max={today} defaultValue={today} className="km-input mt-1.5 w-full rounded-lg border border-field-border px-3 py-2.5 text-sm font-normal"/>
    </label>
    <p className="text-[11px] text-muted">Responsable de la entrega: usuario de la sesión actual.</p>
    {state.error && <p role="alert" className="rounded-lg border border-danger-line bg-danger-soft p-3 text-xs leading-5 text-danger">{state.error}</p>}
    <SubmitButton disabled={pending} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-70">
      {pending && <LoaderCircle size={15} className="animate-spin"/>}{pending ? "Registrando evidencia…" : "Registrar inicial, firma y entrega"}
    </SubmitButton>
  </form>;
}
