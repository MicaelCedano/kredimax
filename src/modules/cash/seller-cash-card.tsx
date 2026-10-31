import Link from "next/link";
import { Check, CircleAlert, Clock3 } from "lucide-react";
import { ActionDialog } from "@/components/ui/action-dialog";
import { decimalToCents, formatDopCents } from "@/lib/format-money";
import { CashClosingForm } from "@/modules/cash/closing-form";
import { CASH_METHODS, CASH_METHOD_LABELS, CASH_TYPE_LABELS, cashExpected, cashGroupStatus, cashRowTotal, hasCashDifference, type SellerCashGroup } from "@/modules/cash/summary";
import type { CashRow } from "@/modules/cash/types";

const dates = new Intl.DateTimeFormat("es-DO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Santo_Domingo" });

function SavedCashClosing({ row }: { row: CashRow }) {
  if (!row.closing) return null;
  const status = hasCashDifference(row);
  return <div className="cash-saved-detail">
    <div className={`cash-feedback ${status ? "cash-feedback-danger" : "cash-feedback-success"}`}><p>{status ? "Cierre guardado con diferencias" : "Caja cuadrada"}</p><span>{dates.format(new Date(row.closing.closedAt))}</span></div>
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

export function SellerCashCard({ group, day, canClose }: { group: SellerCashGroup; day: string; canClose: boolean }) {
  const status = cashGroupStatus(group.rows);
  const Icon = status.tone === "success" ? Check : status.tone === "danger" ? CircleAlert : Clock3;
  const avatar = group.sellerName.replace(/^DEMO\s*[·-]\s*/i, "").split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase();
  return <article className="cash-seller km-panel" aria-label={`Caja de ${group.sellerName}`}>
    <header className="cash-seller-header"><div className="cash-seller-person"><span className="cash-avatar" aria-hidden>{avatar}</span><div><h3>{group.sellerName}</h3><p>{group.branchName ?? "Sin sucursal asignada"}</p></div></div><span className={`cash-status cash-status-${status.tone}`}><Icon size={13} aria-hidden/>{status.label}</span></header>
    <div className="cash-seller-body">{group.rows.map(row => <section className="cash-kind" key={row.type} aria-label={`${CASH_TYPE_LABELS[row.type]} de ${row.sellerName}`}>
      <div className="cash-kind-heading"><h4>{CASH_TYPE_LABELS[row.type]}</h4><p>{row.type === "down_payment" ? "Recibidos al entregar equipos" : "Abonos a financiamientos"}</p></div>
      <div className="cash-kind-actions print:hidden">
        {row.closing ? <ActionDialog trigger="Ver cierre" title={`Cierre de ${CASH_TYPE_LABELS[row.type].toLowerCase()}`} description={row.sellerName}><SavedCashClosing row={row}/></ActionDialog>
          : canClose && row.branchId ? <CashClosingForm key={day} row={row} day={day}/> : <span className="cash-readonly-status">{row.branchId ? "Por cuadrar" : "Sucursal no asignada"}</span>}
        {row.branchId && <Link href={`/cajas/movimientos?${new URLSearchParams({ dia: day, vendedor: row.sellerId, sucursal: row.branchId, tipo: row.type })}`}>Ver movimientos<span className="sr-only"> de {CASH_TYPE_LABELS[row.type].toLowerCase()} de {row.sellerName}</span></Link>}
      </div>
      <p className="cash-kind-total km-amount">{formatDopCents(cashRowTotal(row))}</p>
      <dl className="cash-kind-methods">{CASH_METHODS.filter(method => method !== "other" || decimalToCents(row.other) !== 0n || (row.closing && decimalToCents(row.closing.other) !== 0n)).map(method => <div key={method}><dt>{CASH_METHOD_LABELS[method]}</dt><dd className="km-amount">{formatDopCents(decimalToCents(row[method]))}</dd></div>)}</dl>
      <p className="cash-movement-count">{row.movements} {row.movements === 1 ? "movimiento" : "movimientos"}{row.closing && <span className={hasCashDifference(row) ? "text-danger" : "text-positive"}> · {hasCashDifference(row) ? "Con diferencia" : "Cuadrada"}</span>}</p>
      {row.closing && <div className="cash-print-detail"><SavedCashClosing row={row}/></div>}
    </section>)}</div>
  </article>;
}
