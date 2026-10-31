import { formatDopCents } from "@/lib/format-money";
import { CASH_METHODS, CASH_METHOD_LABELS, summarizeCashRows } from "@/modules/cash/summary";
import type { CashRow } from "@/modules/cash/types";

export function CashDaySummary({ rows }: { rows: CashRow[] }) {
  const summary = summarizeCashRows(rows);
  return <section className="cash-overview" aria-label="Resumen del cuadre">
    <div className="cash-total-panel km-panel">
      <div className="cash-total-top">
        <div className="cash-total-main"><h2>Total cobrado en el día</h2><p className="cash-grand-total km-amount">{formatDopCents(summary.total)}</p></div>
        <dl className="cash-type-totals"><div><dt>Iniciales</dt><dd className="km-amount text-positive">{formatDopCents(summary.byType.down_payment)}</dd></div><div><dt>Cuotas</dt><dd className="km-amount text-accent">{formatDopCents(summary.byType.installment)}</dd></div></dl>
      </div>
      <dl className="cash-overview-methods">{CASH_METHODS.map(method => <div key={method}><dt>{CASH_METHOD_LABELS[method]}</dt><dd className="km-amount">{formatDopCents(summary.byMethod[method])}</dd></div>)}</dl>
    </div>
    <div className="cash-progress-panel km-panel">
      <h2>Avance del cuadre</h2><p className="cash-progress-total">{summary.completedSellers} de {summary.sellerCount} {summary.sellerCount === 1 ? "vendedor" : "vendedores"}</p>
      <p className="cash-progress-caption">{summary.sellerCount ? "han completado sus cierres" : "Sin cajas para esta selección"}</p>
      <div className="cash-progress-line"><div className="cash-progress-track" role="progressbar" aria-label="Cierres guardados" aria-valuenow={summary.progress} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${summary.progress}%` }}/></div><span>{summary.progress}%</span></div>
      <div className="cash-progress-counts"><p><b className="text-accent">{summary.pendingCount}</b><span>por cuadrar</span></p><p><b className={summary.differenceCount ? "text-danger" : "text-secondary"}>{summary.differenceCount}</b><span>con diferencia</span></p></div>
      <p className="cash-progress-note">{!summary.closedCount ? "Los montos se comparan al guardar cada cierre." : `${summary.closedCount} de ${rows.length} cierres guardados. ${summary.pendingCount ? "Aún hay cierres pendientes." : summary.differenceCount ? "Revisa las diferencias por método." : "Todos los importes coinciden."}`}</p>
      {summary.closedCount > 0 && <dl className="cash-saved-totals"><div><dt>Entregado y verificado</dt><dd className="km-amount">{formatDopCents(summary.declared)}</dd></div><div><dt>Diferencia en cierres guardados</dt><dd className="km-amount">{formatDopCents(summary.difference)}</dd></div></dl>}
    </div>
  </section>;
}
