"use client";

import { useActionState, useState } from "react";
import { ActionDialog } from "@/components/ui/action-dialog";
import { formatDopCents } from "@/lib/format-money";
import { deliverCashDrawer, openCashDrawer, receiveCashDrawer } from "@/modules/cash/actions";
import { CASH_METHODS, CASH_METHOD_LABELS, CASH_TYPE_LABELS, cashExpected, compareCashAmounts, compareCashDeclaration, type CashMethod } from "@/modules/cash/summary";
import type { CashRow } from "@/modules/cash/types";

type Target = { branchId: string; sellerId: string; day: string };
type Count = Record<CashMethod, string> & { notes: string };
type Amounts = Record<CashMethod, bigint>;

function initialCount(expected: Amounts): Count {
  return {
    cash: "",
    transfer: expected.transfer === 0n ? "0.00" : "",
    other: expected.other === 0n ? "0.00" : "",
    notes: "",
  };
}

function DrawerFields({ branchId, sellerId, day }: Omit<Target, "sellerId"> & { sellerId?: string }) {
  return <>
    <input type="hidden" name="branchId" value={branchId}/>
    {sellerId && <input type="hidden" name="sellerId" value={sellerId}/>}
    <input type="hidden" name="day" value={day}/>
  </>;
}

function CountFields({ expected, count, onChange, pending, prefix = "", title, receipt = false }: {
  expected: Amounts;
  count: Count;
  onChange: (next: Count) => void;
  pending: boolean;
  prefix?: string;
  title: string;
  receipt?: boolean;
}) {
  const comparison = compareCashAmounts(expected, count, receipt ? 13 : 12);
  return <fieldset disabled={pending} className="cash-count-form cash-count-group">
    <legend>{title}</legend>
    <div className="cash-count-column-labels" aria-hidden>
      <span>{receipt ? "Método / declarado" : "Método / esperado"}</span>
      <span>{receipt ? "Recibido o verificado" : "Entregado o verificado"}</span>
    </div>
    <div className="cash-count-methods">
      {CASH_METHODS.map(method => {
        const difference = comparison.differences[method];
        return <div className="cash-count-method" key={method}>
          <div><p>{CASH_METHOD_LABELS[method]}</p><b className="km-amount">{formatDopCents(expected[method])}</b></div>
          <label className="cash-count-input">
            <span className="sr-only">{CASH_METHOD_LABELS[method]} · {title}</span>
            <input className="km-input" type="number" inputMode="decimal" step="0.01" name={prefix + method}
              required placeholder="0.00" value={count[method]} onChange={event => onChange({ ...count, [method]: event.target.value })}/>
            {difference !== null && <span className={difference === 0n ? "text-positive" : "text-danger"}>
              {difference === 0n ? "Coincide" : `${difference < 0n ? "Faltan" : "Sobran"} ${formatDopCents(difference < 0n ? -difference : difference)}`}
            </span>}
          </label>
        </div>;
      })}
    </div>
    <label className="cash-count-notes">
      Observación {comparison.hasDifferences ? <span className="text-danger">· obligatoria por la diferencia</span> : <span className="text-muted">· opcional</span>}
      <textarea name={prefix + "notes"} maxLength={1000} minLength={comparison.hasDifferences ? 5 : undefined}
        required={comparison.hasDifferences} className="km-input" rows={2} value={count.notes}
        onChange={event => onChange({ ...count, notes: event.target.value })}/>
    </label>
  </fieldset>;
}

export function CashOpenButton({ branchId, day }: Omit<Target, "sellerId">) {
  const [state, action, pending] = useActionState(openCashDrawer, {});
  return <form action={action}>
    <DrawerFields branchId={branchId} day={day}/>
    <button className="km-secondary" type="submit" disabled={pending || state.saved}>
      {pending ? "Abriendo…" : state.saved ? "Caja abierta" : "Abrir caja"}
    </button>
    {state.error && <p role="alert" className="mt-2 text-xs text-danger">{state.error}</p>}
  </form>;
}

export function CashClosingForm({ rows, target, sellerName }: { rows: CashRow[]; target: Target; sellerName: string }) {
  const [state, action, pending] = useActionState(deliverCashDrawer, {});
  const expected = rows.map(row => ({ cash: cashExpected(row, "cash"), transfer: cashExpected(row, "transfer"), other: cashExpected(row, "other") }));
  const [counts, setCounts] = useState(() => expected.map(initialCount));
  const complete = rows.every((row, index) => compareCashDeclaration(row, counts[index]).complete);
  const title = rows.length ? "Cerrar y entregar cuadre" : "Entregar cuadre";

  return <ActionDialog trigger={title} title={title} description={sellerName} destructive>
    {state.saved ? <p role="status" className="cash-feedback cash-feedback-success">Cuadre entregado. Está pendiente de recepción.</p> :
      <form action={action} className="cash-count-form">
        <DrawerFields {...target}/>
        {rows.map((row, index) => <CountFields key={row.type} expected={expected[index]} count={counts[index]}
          onChange={next => setCounts(previous => previous.map((count, position) => position === index ? next : count))}
          pending={pending} prefix={row.type + "-"} title={CASH_TYPE_LABELS[row.type]}/>)}
        {state.error && <p role="alert" className="cash-feedback cash-feedback-danger">{state.error}</p>}
        <p className="cash-count-warning">{rows.length ? "El cierre bloquea nuevos movimientos en esta caja para la fecha seleccionada." : "Los cierres guardados quedan listos para que otra persona confirme su recepción."}</p>
        <button className="km-primary w-full" type="submit" disabled={!complete || pending} aria-busy={pending}>
          {pending ? "Guardando…" : title}
        </button>
      </form>}
  </ActionDialog>;
}

export function CashReceiptForm({ target, sellerName, declared }: { target: Target; sellerName: string; declared: Amounts }) {
  const [state, action, pending] = useActionState(receiveCashDrawer, {});
  const [count, setCount] = useState(() => initialCount(declared));
  const comparison = compareCashAmounts(declared, count, 13);
  const title = "Confirmar recepción";

  return <ActionDialog trigger={title} title={title} description={sellerName}>
    {state.saved ? <p role="status" className="cash-feedback cash-feedback-success">Recepción registrada.</p> :
      <form action={action} className="cash-count-form">
        <DrawerFields {...target}/>
        <CountFields expected={declared} count={count} onChange={setCount} pending={pending} title="Importes recibidos" receipt/>
        {state.error && <p role="alert" className="cash-feedback cash-feedback-danger">{state.error}</p>}
        <button className="km-primary w-full" type="submit" disabled={!comparison.complete || pending} aria-busy={pending}>
          {pending ? "Confirmando…" : title}
        </button>
      </form>}
  </ActionDialog>;
}
