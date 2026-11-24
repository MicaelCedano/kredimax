import Link from "next/link";
import { Check, CircleAlert, Clock3 } from "lucide-react";
import { ActionDialog } from "@/components/ui/action-dialog";
import { decimalToCents, formatDopCents } from "@/lib/format-money";
import { CashClosingForm, CashOpenButton, CashReceiptForm } from "@/modules/cash/closing-form";
import { CASH_METHODS, CASH_METHOD_LABELS, CASH_TYPE_LABELS, cashExpected, cashGroupStatus, cashRowTotal, compareCashAmounts, declaredCashAmounts, hasCashDifference, type SellerCashGroup } from "@/modules/cash/summary";
import type { CashDrawerSession, CashRow } from "@/modules/cash/types";

const dates = new Intl.DateTimeFormat("es-DO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Santo_Domingo" });

function SavedCashClosing({ row }: { row: CashRow }) {
  if (!row.closing) return null;
  const status = hasCashDifference(row);
  return <div className="cash-saved-detail">
    <div className={`cash-feedback ${status ? "cash-feedback-danger" : "cash-feedback-success"}`}><p>{status ? "Cierre guardado con diferencias" : "Importes del cierre coinciden"}</p><span>{dates.format(new Date(row.closing.closedAt))}{row.closing.closedByName && ` · ${row.closing.closedByName}`}</span></div>
    <div className="cash-saved-methods-mobile">{CASH_METHODS.map(method => {
      const declared = decimalToCents(row.closing![method]);
      const difference = declared - cashExpected(row, method);
      return <section key={method}><header><h3>{CASH_METHOD_LABELS[method]}</h3><span className={difference ? "text-danger" : "text-positive"}>{difference ? `${difference > 0n ? "+" : ""}${formatDopCents(difference)}` : "Coincide"}</span></header><dl><div><dt>Esperado</dt><dd className="km-amount">{formatDopCents(cashExpected(row, method))}</dd></div><div><dt>Entregado / verificado</dt><dd className="km-amount">{formatDopCents(declared)}</dd></div></dl></section>;
    })}</div>
    <div className="cash-comparison-scroll"><table className="cash-comparison-table"><thead><tr><th>Método</th><th>Esperado</th><th>Entregado / verificado</th><th>Diferencia</th></tr></thead><tbody>{CASH_METHODS.map(method => {
      const declared = decimalToCents(row.closing![method]);
      const difference = declared - cashExpected(row, method);
      return <tr key={method}><th>{CASH_METHOD_LABELS[method]}</th><td className="km-amount">{formatDopCents(cashExpected(row, method))}</td><td className="km-amount">{formatDopCents(declared)}</td><td className={`km-amount ${difference ? "text-danger" : "text-positive"}`}>{difference > 0n ? "+" : ""}{formatDopCents(difference)}</td></tr>;
    })}</tbody></table></div>
    {row.closing.notes && <p className="cash-saved-note"><b>Observación</b><span>{row.closing.notes}</span></p>}
    <div className="cash-signatures"><p>Firma de quien entrega</p><p>Firma de quien recibe</p></div>
  </div>;
}

function eventLabel(at: string | null | undefined, name: string | null | undefined, empty: string) {
  return at ? `${dates.format(new Date(at))} · ${name || "Usuario registrado"}` : empty;
}

function CashDrawerTimeline({ session, receipt, declared }: {
  session: CashDrawerSession | null | undefined;
  receipt: { cash: string; transfer: string; other: string } | null;
  declared: ReturnType<typeof declaredCashAmounts>;
}) {
  return <div className="cash-handoff">
    <dl className="cash-handoff-timeline">
      <div><dt>Apertura</dt><dd>{eventLabel(session?.opened_at, session?.opened_by_name, "Sin registrar")}</dd></div>
      <div><dt>Cierre y entrega</dt><dd>{eventLabel(session?.delivered_at, session?.delivered_by_name, "Sin registrar")}</dd></div>
      <div><dt>Recepción</dt><dd>{eventLabel(session?.received_at, session?.received_by_name, session?.delivered_at ? "Pendiente" : "Sin registrar")}</dd></div>
    </dl>
    {receipt && <div className="cash-handoff-receipt">
      <h4>Importes recibidos</h4>
      <dl className="cash-handoff-timeline">{CASH_METHODS.map(method => {
        const amount = decimalToCents(receipt[method], 13);
        const difference = amount - declared[method];
        return <div key={method}><dt>{CASH_METHOD_LABELS[method]}</dt><dd className="km-amount">{formatDopCents(amount)}
          {difference !== 0n && <span className="text-danger"> · {difference > 0n ? "+" : ""}{formatDopCents(difference)}</span>}
        </dd></div>;
      })}</dl>
      {session?.receipt_notes && <p className="cash-handoff-note">{session.receipt_notes}</p>}
    </div>}
  </div>;
}

export function SellerCashCard({ group, day, isToday, viewerId, canClose, canReceive }: {
  group: SellerCashGroup; day: string; isToday: boolean; viewerId: string; canClose: boolean; canReceive: boolean;
}) {
  const [firstRow] = group.rows;
  const session = firstRow.session;
  const target = firstRow.branchId ? { branchId: firstRow.branchId, sellerId: group.sellerId, day } : null;
  const declared = declaredCashAmounts(group.rows);
  const receipt = session?.received_cash != null && session.received_transfer != null && session.received_other != null
    ? { cash: session.received_cash, transfer: session.received_transfer, other: session.received_other } : null;
  const receiptHasDifferences = receipt && compareCashAmounts(declared, receipt, 13).hasDifferences;
  const openRows = group.rows.filter(row => !row.closing);
  const hasSavedClosing = openRows.length !== group.rows.length;
  const status = session?.received_at
    ? { tone: receiptHasDifferences ? "danger" : "success", label: receiptHasDifferences ? "Recibida con diferencia" : "Recibida" }
    : session?.delivered_at ? { tone: "warning", label: "Cerrada · pendiente de recibir" }
    : session?.opened_at ? { tone: "success", label: "Abierta" }
    : openRows.length === 0 ? { tone: "warning", label: "Cerrada · entrega sin registrar" }
    : hasSavedClosing ? cashGroupStatus(group.rows) : { tone: "warning", label: "Sin apertura registrada" };
  const Icon = status.tone === "success" ? Check : status.tone === "danger" ? CircleAlert : Clock3;
  const mayOpen = canClose && isToday && viewerId === group.sellerId && !session && !hasSavedClosing;
  const mayDeliver = canClose && !mayOpen && !session?.delivered_at
    && (isToday || session?.opened_at || hasSavedClosing || group.rows.some(row => row.movements > 0));
  const mayReceive = canReceive && session?.delivered_at && !session.received_at && viewerId !== group.sellerId && viewerId !== session.delivered_by;
  const avatar = group.sellerName.replace(/^DEMO\s*[·-]\s*/i, "").split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase();
  return <article className="cash-seller km-panel" aria-label={`Caja de ${group.sellerName}`}>
    <header className="cash-seller-header"><div className="cash-seller-person"><span className="cash-avatar" aria-hidden>{avatar}</span><div><h3>{group.sellerName}</h3><p>{group.branchName ?? "Sin sucursal asignada"}</p></div></div><span className={`cash-status cash-status-${status.tone}`}><Icon size={13} aria-hidden/>{status.label}</span></header>
    <CashDrawerTimeline session={session} receipt={receipt} declared={declared}/>
    {target && (mayOpen || mayDeliver || mayReceive) && <div className="cash-handoff-actions print:hidden">
      {mayOpen && <CashOpenButton key={day} branchId={target.branchId} day={day}/>}
      {mayDeliver && <CashClosingForm key={`${day}:${openRows.map(row => row.type).join(",")}`} rows={openRows} target={target} sellerName={group.sellerName}/>}
      {mayReceive && <CashReceiptForm key={day} target={target} sellerName={group.sellerName} declared={declared}/>}
    </div>}
    <div className="cash-seller-body">{group.rows.map(row => <section className="cash-kind" key={row.type} aria-label={`${CASH_TYPE_LABELS[row.type]} de ${row.sellerName}`}>
      <div className="cash-kind-heading"><h4>{CASH_TYPE_LABELS[row.type]}</h4><p>{row.type === "down_payment" ? "Recibidos al entregar equipos" : "Abonos a financiamientos"}</p></div>
      <div className="cash-kind-actions print:hidden">
        {row.closing && <ActionDialog trigger="Ver cierre" title={`Cierre de ${CASH_TYPE_LABELS[row.type].toLowerCase()}`} description={row.sellerName}><SavedCashClosing row={row}/></ActionDialog>}
        {row.branchId && <Link href={`/cajas/movimientos?${new URLSearchParams({ dia: day, vendedor: row.sellerId, sucursal: row.branchId, tipo: row.type })}`}>Ver movimientos<span className="sr-only"> de {CASH_TYPE_LABELS[row.type].toLowerCase()} de {row.sellerName}</span></Link>}
      </div>
      <p className="cash-kind-total km-amount">{formatDopCents(cashRowTotal(row))}</p>
      <dl className="cash-kind-methods">{CASH_METHODS.filter(method => method !== "other" || decimalToCents(row.other) !== 0n || (row.closing && decimalToCents(row.closing.other) !== 0n)).map(method => <div key={method}><dt>{CASH_METHOD_LABELS[method]}</dt><dd className="km-amount">{formatDopCents(decimalToCents(row[method]))}</dd></div>)}</dl>
      <p className="cash-movement-count">{row.movements} {row.movements === 1 ? "movimiento" : "movimientos"}{row.closing && <span className={hasCashDifference(row) ? "text-danger" : "text-positive"}> · {hasCashDifference(row) ? "Con diferencia" : "Cuadrada"}</span>}</p>
      {row.closing && <div className="cash-print-detail"><SavedCashClosing row={row}/></div>}
    </section>)}</div>
  </article>;
}
