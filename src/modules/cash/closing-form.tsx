"use client";

import { useActionState, useState } from "react";
import { CheckCircle2, CircleAlert } from "lucide-react";
import { ActionDialog } from "@/components/ui/action-dialog";
import { formatDopCents } from "@/lib/format-money";
import { closeCashDay } from "@/modules/cash/actions";
import { CASH_METHODS, CASH_TYPE_LABELS, cashExpected, cashRowTotal, compareCashDeclaration, type CashMethod } from "@/modules/cash/summary";
import type { CashRow } from "@/modules/cash/types";

const inputLabels = { cash: "Efectivo entregado", transfer: "Transferencias verificadas", other: "Tarjeta / otros verificados" };
const methodLabels = { cash: "Efectivo", transfer: "Transferencias", other: "Tarjeta / otros" };
const dayFormat = new Intl.DateTimeFormat("es-DO", { dateStyle: "medium", timeZone: "America/Santo_Domingo" });

export function CashClosingForm({ row, day }: { row: CashRow; day: string }) {
  const [state, action, pending] = useActionState(closeCashDay, {});
  const [amounts, setAmounts] = useState<Record<CashMethod, string>>({ cash: "", transfer: "", other: cashExpected(row, "other") === 0n ? "0" : "" });
  const [notes, setNotes] = useState("");
  const comparison = compareCashDeclaration(row, amounts);
  const type = CASH_TYPE_LABELS[row.type].toLowerCase();
  const title = `Cuadrar ${type}`;
  const feedback = !comparison.complete ? "Cuenta el efectivo y verifica las transferencias."
    : comparison.hasDifferences ? comparison.difference === 0n ? "El total coincide, pero hay diferencias entre métodos." : comparison.difference! < 0n ? "El importe entregado es menor de lo esperado." : "El importe entregado es mayor de lo esperado."
    : "Todo coincide. Puedes guardar el cierre.";
  const FeedbackIcon = comparison.complete && !comparison.hasDifferences ? CheckCircle2 : CircleAlert;
  return <ActionDialog trigger={title} title={title} description={`${row.sellerName} · ${dayFormat.format(new Date(`${day}T12:00:00Z`))}`}>
    {state.saved ? <p role="status" className="cash-feedback cash-feedback-success">Cierre guardado. Los importes quedaron registrados.</p> : <form action={action} className="cash-count-form">
      <input type="hidden" name="sellerId" value={row.sellerId}/><input type="hidden" name="branchId" value={row.branchId ?? ""}/>
      <input type="hidden" name="day" value={day}/><input type="hidden" name="type" value={row.type}/>
      <div className="cash-count-expected"><span>Esperado en {type}</span><b className="km-amount">{formatDopCents(cashRowTotal(row))}</b></div>
      <div className="cash-count-column-labels" aria-hidden><span>Método / esperado</span><span>Entregado o verificado</span></div>
      <div className="cash-count-methods">{CASH_METHODS.map(method => <div className="cash-count-method" key={method}>
        <div><p>{methodLabels[method]}</p><b className="km-amount">{formatDopCents(cashExpected(row, method))}</b></div>
        <label className="cash-count-input"><span className="sr-only">{inputLabels[method]}</span><input className="km-input" type="number" inputMode="decimal" step="0.01" name={method} required autoFocus={method === "cash"} disabled={pending} placeholder="0.00" value={amounts[method]} onChange={event => setAmounts(previous => ({ ...previous, [method]: event.target.value }))}/>
          {comparison.differences[method] !== null && <span className={comparison.differences[method] === 0n ? "text-positive" : "text-danger"}>{comparison.differences[method] === 0n ? "Coincide" : `${comparison.differences[method]! < 0n ? "Faltan" : "Sobran"} ${formatDopCents(comparison.differences[method]! < 0n ? -comparison.differences[method]! : comparison.differences[method]!)}`}</span>}
        </label>
      </div>)}</div>
      <div className={`cash-feedback ${!comparison.complete ? "cash-feedback-neutral" : comparison.hasDifferences ? "cash-feedback-danger" : "cash-feedback-success"}`} role="status" aria-live="polite">
        <FeedbackIcon size={17} aria-hidden/><div><p>{feedback}</p>{comparison.complete && <span>Diferencia total: <b className="km-amount">{comparison.difference! > 0n ? "+" : ""}{formatDopCents(comparison.difference!)}</b></span>}</div>
      </div>
      <label className="cash-count-notes">Observación {comparison.hasDifferences ? <span className="text-danger">· obligatoria por la diferencia</span> : <span className="text-muted">· opcional</span>}<textarea name="notes" maxLength={1000} minLength={comparison.hasDifferences ? 5 : undefined} required={comparison.hasDifferences} disabled={pending} className="km-input" rows={2} value={notes} onChange={event => setNotes(event.target.value)} placeholder="Explica cualquier diferencia o detalle de la entrega."/></label>
      {state.error && <p role="alert" className="cash-feedback cash-feedback-danger">{state.error}</p>}
      <p className="cash-count-warning">Al guardar, este cierre queda definitivo. No se podrán agregar cobros ni reversos para esta caja, fecha y tipo.</p>
      <button disabled={pending || !comparison.complete} aria-busy={pending} className="km-primary w-full" type="submit">{pending ? "Guardando cierre…" : `Guardar cierre de ${type}`}</button>
    </form>}
  </ActionDialog>;
}
