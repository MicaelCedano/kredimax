import Link from "next/link";
import { CustomerLabel, StatusBadge } from "@/components/ui/status-badge";
import { Feedback } from "@/components/ui/feedback";
import { PanelHeading } from "@/components/ui/panel-heading";
import { EmptyState } from "@/components/ui/empty-state";
import { SubmitButton } from "@/components/forms/submit-button";
import { formatDop } from "@/lib/format-money";
import { getTenantAccess } from "@/lib/security/tenant-access";

import { portfolioFilter, responsibleLabel, type PortfolioSeller } from "@/modules/customers/portfolio";

const labels: Record<string, string> = { "": "Todos los clientes", balance: "Con saldo pendiente", current: "Al día", due: "Pendiente hoy", overdue: "Vencido", settled: "Saldado", none: "Sin crédito activo" };
const tones: Record<string, string> = { current: "paid", due: "partial", overdue: "overdue", settled: "paid_off", none: "draft" };
export type CollectionQuery = { collectionSeller?: string; collectionQ?: string; collectionStatus?: string; collectionBranch?: string; collectionFrom?: string; collectionTo?: string; collectionPage?: string };
type Account = { sellerId: string | null; sellerName: string | null; id: string; name: string; identity: string | null; phone: string | null; branch: string | null; photoUpdatedAt: string | null; status: string; activeLoans: number; paidLoans: number; balance: string; overdueBalance: string; todayBalance: string; pendingInstallments: number; overdueInstallments: number; overdueDays: number; nextDueDate: string | null };
type Result = { count: number; counts: Record<string, number>; rows: Account[] };
type Access = Extract<Awaited<ReturnType<typeof getTenantAccess>>, { ok: true }>;

export async function CustomerCollectionsPanel({ access, query }: { access: Access; query: CollectionQuery }) {
  const seller = portfolioFilter(query.collectionSeller);
  const search = (query.collectionQ ?? "").trim().slice(0, 100);
  const status = Object.hasOwn(labels, query.collectionStatus ?? "") ? query.collectionStatus ?? "" : "";
  const branch = /^[0-9a-f-]{36}$/i.test(query.collectionBranch ?? "") ? query.collectionBranch! : "";
  const page = Math.max(1, Math.min(100000, Number.parseInt(query.collectionPage ?? "1", 10) || 1));
  const from = /^\d{4}-\d{2}-\d{2}$/.test(query.collectionFrom ?? "") ? query.collectionFrom! : "";
  const to = /^\d{4}-\d{2}-\d{2}$/.test(query.collectionTo ?? "") ? query.collectionTo! : "";
  const [response, sellerResult, branches] = await Promise.all([
    access.supabase.rpc("customer_collection_page", { p_tenant_id: access.membership.tenant_id, p_search: search, p_status: status, p_branch_id: branch || null, p_from: from || null, p_to: to || null, p_page: page, p_page_size: 25, p_seller: seller }),
    access.supabase.rpc("customer_portfolio_sellers", { p_tenant_id: access.membership.tenant_id }),
    access.supabase.from("branches").select("id,name").eq("tenant_id", access.membership.tenant_id).order("name"),
  ]);
  const sellers = (sellerResult.data ?? []) as PortfolioSeller[];
  const result = response.data as Result | null;
  const href = (nextStatus: string, nextPage = 1) => {
    const params = new URLSearchParams({ collectionSeller: seller, collectionQ: search, collectionStatus: nextStatus, collectionBranch: branch, collectionFrom: from, collectionTo: to, collectionPage: String(nextPage) });
    return `/cobros?${params}#clientes-cobros`;
  };
  return <section id="clientes-cobros" className="km-panel mb-6 scroll-mt-24 overflow-hidden">
    <PanelHeading title="Estado de cobro por cliente" description="Cada persona cuenta una sola vez. Sus saldos y cuotas se suman entre todos sus financiamientos activos."/>
    <div className="flex flex-col gap-4 p-4 sm:p-5">
      <form key={JSON.stringify([search, status, branch, from, to, seller])} action="/cobros#clientes-cobros" method="get" className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <label className="text-xs font-semibold text-secondary">Buscar cliente<input type="search" name="collectionQ" defaultValue={search} maxLength={100} placeholder="Nombre, cédula o teléfono" className="km-input mt-1 w-full"/></label>
        <label className="text-xs font-semibold text-secondary">Estado de cobro<select name="collectionStatus" defaultValue={status} className="km-input mt-1 w-full">{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="text-xs font-semibold text-secondary">Sucursal<select name="collectionBranch" defaultValue={branch} className="km-input mt-1 w-full"><option value="">Todas las sucursales visibles</option>{(branches.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="text-xs font-semibold text-secondary">Responsable de cobro<select name="collectionSeller" defaultValue={seller} className="km-input mt-1 w-full"><option value="">Todas las carteras visibles</option><option value={access.userId}>Mi cartera</option>{sellers.filter(item => item.id !== access.userId).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}<option value="unassigned">Sin responsable (registros anteriores)</option></select></label>
        <label className="text-xs font-semibold text-secondary">Vencimiento pendiente desde<input type="date" name="collectionFrom" defaultValue={from} className="km-input mt-1 w-full"/></label>
        <label className="text-xs font-semibold text-secondary">Vencimiento pendiente hasta<input type="date" name="collectionTo" defaultValue={to} className="km-input mt-1 w-full"/></label>
        <div className="flex flex-wrap gap-2"><SubmitButton className="km-primary">Filtrar clientes</SubmitButton><Link href="/cobros#clientes-cobros" className="km-secondary">Limpiar</Link></div>
      </form>
      <p className="text-[11px] leading-5 text-muted">Vencido: tiene cuotas sin completar de días anteriores. Pendiente hoy: debe pagar hoy y no tiene atraso. Al día: sus cuotas pendientes vencen después de hoy. Los filtros de fechas usan la primera cuota pendiente de cada cliente.</p>
      {response.error || branches.error || sellerResult.error || !result ? <Feedback tone="error">No se pudo consultar el estado de los clientes. Revisa los filtros e inténtalo otra vez.</Feedback> : <>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-7">{Object.entries(labels).map(([value, label]) => <Link key={value} href={href(value)} aria-current={value === status ? "page" : undefined} className={`rounded-xl border p-3 ${value === status ? "border-accent bg-accent-soft" : "border-line bg-subtle hover:border-accent-line"}`}><span className="block text-[11px] text-secondary">{label}</span><b className="mt-2 block text-2xl tabular-nums text-ink">{result.counts[value || "all"] ?? 0}</b></Link>)}</div>
        <p className="text-xs text-muted">{result.count.toLocaleString("es-DO")} {result.count === 1 ? "cliente encontrado" : "clientes encontrados"} · Los conteos incluyen todas las páginas y respetan la búsqueda, la sucursal, el responsable y las fechas.</p>
        {result.rows.length ? <>
          <div className="flex flex-col divide-y divide-line md:hidden">{result.rows.map((row) => <article key={row.id} className="flex flex-col gap-3 py-4">
            <CustomerLabel name={row.name} photoUrl={row.photoUpdatedAt ? `/api/clientes/${row.id}/foto?v=${encodeURIComponent(row.photoUpdatedAt)}` : undefined}/>
            <div className="flex flex-wrap items-center justify-between gap-2"><StatusBadge status={tones[row.status]} label={labels[row.status]}/><span className="text-xs text-muted">{row.branch ?? "Sin sucursal"}</span></div>
            <p className="text-xs text-secondary">{row.identity ?? "Sin cédula"} · {row.phone ?? "Sin teléfono"}</p>
            <p className="text-xs text-secondary">Responsable de cobro: {responsibleLabel(row.sellerId, row.sellerName)}</p>
            <dl className="grid grid-cols-2 gap-3 rounded-lg bg-subtle p-3 text-xs"><div><dt>Saldo pendiente</dt><dd className="mt-1 font-bold">{formatDop(row.balance)}</dd></div><div><dt>Saldo vencido</dt><dd className="mt-1 font-bold text-danger">{formatDop(row.overdueBalance)}</dd></div><div><dt>Cuotas pendientes</dt><dd>{row.pendingInstallments} · {row.overdueInstallments} vencidas</dd></div><div><dt>Vencimiento pendiente</dt><dd>{row.nextDueDate?.split("-").reverse().join("/") ?? "—"}</dd></div></dl>
            <Link href={`/clientes/${row.id}`} className="text-xs font-semibold text-accent">Ver ficha del cliente →</Link>
          </article>)}</div>
          <div className="hidden overflow-x-auto md:block"><table className="km-table min-w-[840px]"><thead><tr><th>Cliente / contacto</th><th>Responsable de cobro</th><th>Estado</th><th>Cuotas pendientes</th><th>Saldo pendiente</th><th>Saldo vencido</th><th>Vencimiento pendiente</th><th>Ficha</th></tr></thead><tbody>{result.rows.map((row) => <tr key={row.id}>
            <td><CustomerLabel name={row.name} photoUrl={row.photoUpdatedAt ? `/api/clientes/${row.id}/foto?v=${encodeURIComponent(row.photoUpdatedAt)}` : undefined}/><p className="ml-12 mt-1 text-[11px] text-muted">{row.identity ?? "Sin cédula"} · {row.phone ?? "Sin teléfono"}<br/>{row.branch ?? "Sin sucursal"}</p></td>
            <td className="text-xs">{responsibleLabel(row.sellerId, row.sellerName)}</td>
            <td><StatusBadge status={tones[row.status]} label={labels[row.status]}/>{row.overdueDays > 0 && <span className="mt-1 block text-[11px] text-danger">{row.overdueDays} días de atraso</span>}</td>
            <td><b>{row.pendingInstallments}</b><span className="block text-[11px] text-muted">{row.overdueInstallments} vencidas · {row.activeLoans} créditos activos</span></td>
            <td className="km-amount font-semibold">{formatDop(row.balance)}</td><td className="km-amount text-danger">{formatDop(row.overdueBalance)}</td><td className="text-xs">{row.nextDueDate?.split("-").reverse().join("/") ?? "—"}</td>
            <td><Link href={`/clientes/${row.id}`} className="text-xs font-semibold text-accent">Ver ficha →</Link></td>
          </tr>)}</tbody></table></div>
          <nav aria-label="Paginación de clientes de cobros" className="flex items-center justify-between gap-2 border-t border-line pt-3 text-xs"><Link href={href(status, Math.max(1, page - 1))} aria-disabled={page <= 1} className={page <= 1 ? "pointer-events-none text-muted" : "font-semibold text-accent"}>Anterior</Link><span>Página {page} de {Math.max(1, Math.ceil(result.count / 25))}</span><Link href={href(status, page + 1)} aria-disabled={page * 25 >= result.count} className={page * 25 >= result.count ? "pointer-events-none text-muted" : "font-semibold text-accent"}>Siguiente</Link></nav>
        </> : <EmptyState title="No hay clientes con estos filtros" description="Prueba otro estado, nombre, sucursal o rango de fechas."/>}
      </>}
    </div>
  </section>;
}
