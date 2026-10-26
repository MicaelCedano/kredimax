import Link from "next/link";
import { redirect } from "next/navigation";
import { ReceiptText } from "lucide-react";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { CustomerLabel, StatusBadge } from "@/components/ui/status-badge";
import { PanelHeading } from "@/components/ui/panel-heading";
import { EmptyState } from "@/components/ui/empty-state";
import { Feedback } from "@/components/ui/feedback";
import { SubmitButton } from "@/components/forms/submit-button";
import { getTenantAccess } from "@/lib/security/tenant-access";
import { formatDop } from "@/lib/format-money";
import { parseReceiptFilters, receiptListHref, RECEIPT_METHODS, RECEIPT_STATUSES, RECEIPT_TYPES, type ReceiptQuery } from "@/modules/payments/receipt-filters";

type Receipt = { hasEvidence: boolean; id: string; amount: string; currency: string; receivedAt: string; method: string; type: string; reference: string | null; reversedAt: string | null; loanId: string; customerId: string; customerName: string; identity: string | null; phone: string | null; contract: string; branch: string | null; photoUpdatedAt: string | null };
type ReceiptResult = { count: number; summary: { registered: number; reversed: number; registeredAmount: string; reversedAmount: string }; rows: Receipt[] };
const dates = new Intl.DateTimeFormat("es-DO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Santo_Domingo" });

export default async function ReceiptsPage({ searchParams }: { searchParams: Promise<ReceiptQuery> }) {
  const [query, access] = await Promise.all([searchParams, getTenantAccess("payments.read")]);
  if (!access.ok && access.reason === "unauthenticated") redirect("/login");
  const filters = parseReceiptFilters(query);
  const [receipts, branches] = access.ok && !filters.invalid ? await Promise.all([
    access.supabase.rpc("tenant_receipt_page", { p_tenant_id: access.membership.tenant_id, p_search: filters.q, p_status: filters.status, p_type: filters.type, p_method: filters.method, p_branch_id: filters.branch || null, p_customer_id: filters.customer || null, p_from: filters.from || null, p_to: filters.to || null, p_page: filters.page, p_page_size: 25 }),
    access.supabase.from("branches").select("id,name").eq("tenant_id", access.membership.tenant_id).order("name"),
  ]) : [{ data: null, error: null }, { data: [], error: null }];
  const result = receipts.data as ReceiptResult | null;
  const hasError = receipts.error || branches.error || (!result && !filters.invalid && access.ok);
  const actionLink = (row: Receipt) => <div className="flex flex-col items-start gap-2"><span className="text-[11px] text-muted">{row.hasEvidence ? "Con evidencia" : "Sin imagen adjunta"}</span><Link href={`/recibos/${row.id}`} className="km-secondary inline-flex min-h-10 items-center justify-center gap-2 whitespace-nowrap"><ReceiptText size={15} aria-hidden/>Abrir voucher</Link></div>;
  return <div className="min-h-screen bg-canvas"><Sidebar/><Topbar/><main id="main-content" tabIndex={-1} className="km-main px-4 pb-10 pt-7 sm:px-7 lg:ml-[244px] lg:px-7">
    <div className="mb-6"><h1 className="km-page-title">Vouchers de clientes</h1><p className="mt-1 text-sm text-muted">Todos los comprobantes de pagos registrados. Abre cualquier voucher para revisarlo o imprimirlo.</p></div>
    {!access.ok ? <Feedback tone="warning">Tu usuario no tiene permiso para consultar los comprobantes.</Feedback> : <>
      <section className="km-panel mb-5 p-4 sm:p-5">
        {filters.customer && <p className="mb-4 text-sm font-semibold text-accent">Comprobantes del cliente seleccionado · <Link href={`/clientes/${filters.customer}`} className="underline">Ver ficha</Link></p>}
        <form key={receiptListHref(filters)} action="/recibos" method="get" className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {filters.customer && <input type="hidden" name="customer" value={filters.customer}/>}
          <label className="text-xs font-semibold text-secondary">Buscar voucher<input type="search" name="q" defaultValue={filters.q} maxLength={100} placeholder="Cliente, cédula, teléfono, folio o referencia" className="km-input mt-1 w-full"/></label>
          <label className="text-xs font-semibold text-secondary">Estado<select name="status" defaultValue={filters.status} className="km-input mt-1 w-full">{Object.entries(RECEIPT_STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="text-xs font-semibold text-secondary">Tipo de pago<select name="type" defaultValue={filters.type} className="km-input mt-1 w-full">{Object.entries(RECEIPT_TYPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="text-xs font-semibold text-secondary">Método de pago<select name="method" defaultValue={filters.method} className="km-input mt-1 w-full">{Object.entries(RECEIPT_METHODS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="text-xs font-semibold text-secondary">Sucursal<select name="branch" defaultValue={filters.branch} className="km-input mt-1 w-full"><option value="">Todas las sucursales visibles</option>{(branches.data ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
          <label className="text-xs font-semibold text-secondary">Desde<input type="date" name="from" defaultValue={filters.from} className="km-input mt-1 w-full"/></label>
          <label className="text-xs font-semibold text-secondary">Hasta<input type="date" name="to" defaultValue={filters.to} className="km-input mt-1 w-full"/></label>
          <div className="flex flex-wrap gap-2"><SubmitButton className="km-primary">Filtrar vouchers</SubmitButton><Link href="/recibos" className="km-secondary">Limpiar</Link></div>
        </form>
      </section>
      {filters.invalid ? <Feedback tone="warning">Revisa los filtros: selecciona opciones válidas y una fecha final igual o posterior a la inicial.</Feedback> : hasError ? <Feedback tone="error">No se pudieron consultar los comprobantes. Inténtalo de nuevo.</Feedback> : result && <>
        <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">{[["Vouchers encontrados", result.count], ["Registrados", result.summary.registered], ["Revertidos", result.summary.reversed], ["Monto vigente", formatDop(result.summary.registeredAmount)]].map(([label, value]) => <div key={label} className="km-panel p-4"><p className="text-xs text-muted">{label}</p><p className="mt-2 break-words text-xl font-bold tabular-nums text-ink">{value}</p></div>)}</div>
        <section className="km-panel overflow-hidden"><PanelHeading title={`Comprobantes · ${result.count.toLocaleString("es-DO")}`} description="Incluye pagos iniciales, abonos y pagos de cuotas. Los revertidos conservan su comprobante y no se suman al monto vigente."/>
          {result.rows.length ? <>
            <div className="flex flex-col divide-y divide-line p-4 md:hidden">{result.rows.map((row) => <article key={row.id} className="flex flex-col gap-3 py-4">
              <CustomerLabel name={row.customerName} photoUrl={row.photoUpdatedAt ? `/api/clientes/${row.customerId}/foto?v=${encodeURIComponent(row.photoUpdatedAt)}` : undefined}/>
              <div className="flex flex-wrap items-center justify-between gap-2"><b className="text-lg tabular-nums">{formatDop(row.amount)}</b><StatusBadge status={row.reversedAt ? "reversed" : "registered"}/></div>
              <p className="text-xs leading-5 text-secondary">{dates.format(new Date(row.receivedAt))}<br/>{row.type === "down_payment" ? "Inicial" : "Pago de cuotas"} · {RECEIPT_METHODS[row.method as keyof typeof RECEIPT_METHODS] ?? row.method}<br/>{row.contract} · {row.branch ?? "Sin sucursal"}</p>
              <p className="break-words text-xs text-muted">Referencia: {row.reference || "Sin referencia"}</p><p className="break-all font-mono text-[10px] text-muted">Folio: {row.id}</p>
              {actionLink(row)}
            </article>)}</div>
            <div className="hidden overflow-x-auto md:block"><table className="km-table min-w-[980px]"><thead><tr><th>Cliente</th><th>Fecha / folio</th><th>Tipo / contrato</th><th>Monto</th><th>Método / referencia</th><th>Estado</th><th>Comprobante</th></tr></thead><tbody>{result.rows.map((row) => <tr key={row.id}>
              <td><CustomerLabel name={row.customerName} photoUrl={row.photoUpdatedAt ? `/api/clientes/${row.customerId}/foto?v=${encodeURIComponent(row.photoUpdatedAt)}` : undefined}/><p className="ml-12 mt-1 text-[11px] text-muted">{row.identity ?? "Sin documento"}<br/>{row.branch ?? "Sin sucursal"}</p></td>
              <td className="text-xs"><span className="block whitespace-nowrap">{dates.format(new Date(row.receivedAt))}</span><span title={row.id} className="mt-1 block font-mono text-[10px] text-muted">{row.id.slice(0, 8).toUpperCase()}…</span></td>
              <td className="text-xs">{row.type === "down_payment" ? "Inicial" : "Pago de cuotas"}<span className="mt-1 block text-[11px] text-muted">{row.contract}</span></td>
              <td className="km-amount font-semibold">{formatDop(row.amount)}</td><td className="max-w-48 break-words text-xs">{RECEIPT_METHODS[row.method as keyof typeof RECEIPT_METHODS] ?? row.method}<span className="mt-1 block text-[11px] text-muted">{row.reference || "Sin referencia"}</span></td>
              <td><StatusBadge status={row.reversedAt ? "reversed" : "registered"}/></td><td>{actionLink(row)}</td>
            </tr>)}</tbody></table></div>
            <nav aria-label="Paginación de vouchers" className="flex items-center justify-between border-t border-line p-4 text-xs"><Link href={receiptListHref(filters, Math.max(1, filters.page - 1))} aria-disabled={filters.page <= 1} className={filters.page <= 1 ? "pointer-events-none text-muted" : "font-semibold text-accent"}>Anterior</Link><span>Página {filters.page} de {Math.max(1, Math.ceil(result.count / 25))}</span><Link href={receiptListHref(filters, filters.page + 1)} aria-disabled={filters.page * 25 >= result.count} className={filters.page * 25 >= result.count ? "pointer-events-none text-muted" : "font-semibold text-accent"}>Siguiente</Link></nav>
          </> : <EmptyState title="No hay vouchers con estos filtros" description="Prueba otro cliente, estado, sucursal o rango de fechas."/>}
        </section>
        <p className="mt-3 text-[11px] text-muted">Los conteos y montos incluyen todas las páginas de los filtros seleccionados. Fechas de recepción en hora de República Dominicana.</p>
      </>}
    </>}
  </main></div>;
}
