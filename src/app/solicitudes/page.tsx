import { hasVariableInstallments } from "@/modules/financing/installment-summary";
import { PanelHeading } from "@/components/ui/panel-heading";
import Link from "next/link";
import { CheckCheck, Clock3, Plus, SearchCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { getTenantAccess } from "@/lib/security/tenant-access";
import { CustomerLabel, StatusBadge } from "@/components/ui/status-badge";

import { EmptyState } from "@/components/ui/empty-state";

const statusLabels: Record<string, string> = {
  pending: "Pendiente de evaluación",
  documents_requested: "Documentación solicitada",
  approved: "Aprobada",
  rejected: "Rechazada",
};
const messages: Record<string, string> = {
  creada: "La solicitud, su cotización y el equipo asociado quedaron guardados.",
  invalid: "Revisa los datos de la solicitud y los montos.",
  "invalid-form": "Revisa los campos de la solicitud.",
  "invalid-customer": "Revisa el nombre y los datos del cliente nuevo.",
  "invalid-income": "El ingreso mensual debe ser un monto válido.",
  "quote-invalid": "No se pudo calcular la cotización; revisa precio, plazo y fecha de primera cuota.",
  "quote-date-invalid": "La fecha de la primera cuota no es válida o quedó antes de la fecha actual.",
  "quote-settings-invalid": "La configuración de inicial o tasa no tiene un formato válido.",
  "quote-price-invalid": "El precio de venta o los gastos configurados no tienen un formato válido.",
  duplicate: "Esta solicitud ya se había enviado.",
  "duplicate-customer": "Ya existe un cliente con esa cédula. Selecciona el expediente existente para crear la solicitud.",
  "save-error": "No se pudo guardar. Verifica la base local e inténtalo otra vez.",
  unavailable: "No se pudo consultar Supabase local.",
  forbidden: "Tu usuario no tiene permiso para esta acción.",
  unauthenticated: "Inicia sesión para continuar.",
  "customer-not-found": "No se encontró el cliente dentro de tu empresa.",
  "device-identifier-required": "Indica un IMEI o número de serie del equipo.",
  "device-identifier-conflict": "Ese IMEI ya está registrado en el inventario. Verifica el identificador de esta unidad.",
  "device-not-in-inventory": "No se puede aprobar hasta asociar el equipo con el inventario local.",
  "reference-consent-required": "Confirma la autorización para guardar los datos de la referencia.",
  "invalid-reference": "Completa nombre y teléfono de la referencia o deja ambos en blanco.",
  "term-not-allowed": "El plazo no está habilitado por administración.",
  "recovery-review-required": "La recuperación estimada no llega a la meta; requiere revisión manual.",
  "review-note-required": "Escribe una nota para rechazar o solicitar documentación.",
  "additional-charge-approval-required": "El ajuste propuesto requiere categoría, soporte contractual y aprobación expresa.",
  "review-invalid": "Revisa los datos de la decisión.",
  "review-error": "No se pudo registrar la decisión. Puede que otra persona ya haya revisado la solicitud.",
};

function money(value: string | undefined) {
  if (!value) return "—";
  return new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value)).replace("DOP", "RD$");
}

type ApplicationRow = { id: string; customer_id: string; status: string; quote_snapshot: unknown; created_at: string; created_by: string; created_by_name: string | null };

function ApplicationRows({ rows, customerNames, showCreator }: { rows: ApplicationRow[]; customerNames: Map<string,string>; showCreator: boolean }) {
  return <>
    <div className="divide-y divide-line md:hidden">{rows.map(row => {
      const quote = row.quote_snapshot as { device?: { brand?: string; model?: string }; fixedInstallment?: string; schedule?: { sequence: number; amount: string }[]; frequency?: string };
      return <article key={row.id} className="space-y-4 p-5"><CustomerLabel name={customerNames.get(row.customer_id) ?? "Cliente"}/>{showCreator && <p className="text-xs text-muted">Vendedor: <span className="font-medium text-secondary">{row.created_by_name ?? "Usuario registrado"}</span></p>}<div className="flex flex-wrap items-center justify-between gap-3"><span className="text-xs text-muted">{quote.device?.brand} {quote.device?.model ?? "Equipo"}</span><StatusBadge status={row.status} label={statusLabels[row.status]}/></div><div className="flex items-end justify-between gap-3 border-t border-line pt-3"><div><p className="text-xs text-muted">{hasVariableInstallments(quote.schedule) ? "Cuota inicial" : "Cuota"} {quote.frequency === "fortnightly" ? "quincenal" : "mensual"}</p><p className="mt-1 text-lg font-bold tabular-nums text-ink">{money(quote.fixedInstallment)}</p></div><Link href={`/solicitudes/${row.id}`} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-accent-line px-3 py-2 text-xs font-semibold text-accent"><SearchCheck size={15} aria-hidden/>Revisar solicitud</Link></div></article>;
    })}</div>
    <div className="hidden overflow-x-auto md:block"><table className="km-table min-w-[680px]"><thead><tr><th>Cliente</th>{showCreator && <th>Vendedor</th>}<th>Equipo</th><th>Cuota</th><th>Estado</th><th className="text-right">Detalle</th></tr></thead><tbody>{rows.map(row => {
      const quote = row.quote_snapshot as { device?: { brand?: string; model?: string }; fixedInstallment?: string; schedule?: { sequence: number; amount: string }[]; frequency?: string; adjustmentRequiresApproval?: boolean };
      return <tr key={row.id}><td><CustomerLabel name={customerNames.get(row.customer_id) ?? "Cliente"}/><span className="ml-12 mt-1 block text-xs font-normal text-muted">{new Intl.DateTimeFormat("es-DO", { dateStyle: "medium", timeZone: "America/Santo_Domingo" }).format(new Date(row.created_at))}</span></td>{showCreator && <td className="text-xs text-secondary">{row.created_by_name ?? "Usuario registrado"}</td>}<td className="text-secondary">{quote.device?.brand ?? ""} {quote.device?.model ?? "Equipo"}{quote.adjustmentRequiresApproval && <span className="mt-1 block text-xs text-warning">Ajuste sujeto a aprobación</span>}</td><td className="font-semibold tabular-nums text-ink">{money(quote.fixedInstallment)}{hasVariableInstallments(quote.schedule) && <span className="mt-1 block text-xs font-normal text-accent">Luego {money(quote.schedule?.at(-1)?.amount)}</span>}<span className="mt-1 block text-xs font-normal text-muted">{quote.frequency === "fortnightly" ? "Quincenal" : "Mensual"}</span></td><td><StatusBadge status={row.status} label={statusLabels[row.status]}/></td><td className="text-right"><Link href={`/solicitudes/${row.id}`} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-accent-line px-3 py-2 text-xs font-semibold text-accent hover:bg-accent-soft"><SearchCheck size={14} aria-hidden/>Revisar</Link></td></tr>;
    })}</tbody></table></div>
  </>;
}

function applicationHref(pendingPage: number, historyPage: number, seller: string) {
  const query = new URLSearchParams({ pendingPage: String(pendingPage), page: String(historyPage) });
  if (seller) query.set("vendedor", seller);
  return `/solicitudes?${query}`;
}

function ApplicationPagination({ group, current, total, pendingPage, historyPage, seller }: {
  group: "pending" | "history"; current: number; total: number; pendingPage: number; historyPage: number; seller: string;
}) {
  const href = (next: number) => applicationHref(group === "pending" ? next : pendingPage, group === "history" ? next : historyPage, seller);
  return <nav aria-label={`Paginación de solicitudes ${group === "pending" ? "pendientes" : "evaluadas"}`} className="flex items-center justify-between gap-3 border-t border-line px-5 py-4 text-xs"><Link aria-disabled={current <= 1} className={current <= 1 ? "pointer-events-none text-muted" : "font-semibold text-accent"} href={href(Math.max(1,current-1))}>Anterior</Link><span className="text-muted">Página {current} de {total}</span><Link aria-disabled={current >= total} className={current >= total ? "pointer-events-none text-muted" : "font-semibold text-accent"} href={href(Math.min(total,current+1))}>Siguiente</Link></nav>;
}

export default async function CreditApplicationsPage({ searchParams }: { searchParams: Promise<{ estado?: string; page?: string; pendingPage?: string; vendedor?: string }> }) {
  const [{ estado, page: rawPage, pendingPage: rawPendingPage, vendedor: rawSeller }, access, writeAccess] = await Promise.all([
    searchParams, getTenantAccess("financing.read"), getTenantAccess("financing.write"),
  ]);
  if (!access.ok && access.reason === "unauthenticated") redirect("/login");
  const parsePage = (raw?: string) => Math.max(1, Math.min(100_000, Number.parseInt(raw ?? "1",10) || 1));
  const historyPage = parsePage(rawPage);
  const pendingPage = parsePage(rawPendingPage);
  const pageSize = 50;
  const isAdmin = access.ok && access.membership.role === "tenant_admin";
  const selectedSeller = isAdmin ? rawSeller ?? "" : "";
  const validSeller = !selectedSeller || z.uuid().safeParse(selectedSeller).success;
  // Filter each queue in PostgreSQL before pagination so pending requests are never buried behind history pages.
  const loadGroup = (statuses: string[], page: number) => {
    if (!access.ok || !validSeller) return Promise.resolve({ data:null, error:null, count:0 });
    let query = access.supabase.from("credit_applications").select("id,customer_id,status,quote_snapshot,created_at,created_by,created_by_name", { count:"exact" })
      .eq("tenant_id", access.membership.tenant_id).in("status",statuses);
    if (!isAdmin) query = query.eq("created_by", access.userId);
    else if (selectedSeller) query = query.eq("created_by", selectedSeller);
    return query.order("created_at", { ascending:false }).order("id", { ascending:false }).range((page-1)*pageSize,page*pageSize-1);
  };
  const [pending, history, creators] = await Promise.all([
    loadGroup(["pending","documents_requested"],pendingPage), loadGroup(["approved","rejected"],historyPage),
    access.ok && isAdmin ? access.supabase.rpc("application_creator_directory", { p_tenant_id: access.membership.tenant_id }) : Promise.resolve({ data: [], error: null }),
  ]);
  const sellers = (creators.data ?? []) as { id: string; name: string }[];
  const pendingRows = pending.data ?? [];
  const historyRows = history.data ?? [];
  const pendingCount = pending.count ?? 0;
  const historyCount = history.count ?? 0;
  const pendingPages = Math.max(1,Math.ceil(pendingCount/pageSize));
  const historyPages = Math.max(1,Math.ceil(historyCount/pageSize));
  const customerIds = [...new Set([...pendingRows,...historyRows].map(row => row.customer_id))];
  const customers = access.ok && customerIds.length
    ? await access.supabase.from("customers").select("id,full_name").eq("tenant_id",access.membership.tenant_id).in("id",customerIds)
    : { data:[],error:null };
  const names = new Map((customers.data ?? []).map(customer => [customer.id,customer.full_name]));
  const notice = estado ? messages[estado] : null;
  const noticeError = Boolean(estado && estado !== "creada");
  const failed = !access.ok || !validSeller || pending.error || history.error || customers.error || creators.error;

  return <div className="min-h-screen bg-canvas"><Sidebar/><Topbar/><main id="main-content" tabIndex={-1} className="km-main px-4 pb-10 pt-7 sm:px-7 lg:ml-[244px] lg:px-7">
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3"><div><h1 className="km-page-title">Solicitudes de financiamiento</h1><p className="mt-2 text-sm text-muted">{isAdmin ? "Consulta todas las solicitudes e identifica al vendedor que registró cada una." : "Solo ves las solicitudes que registraste, incluidas sus decisiones y entregas."}</p></div>{writeAccess.ok && <Link href="/solicitudes/nueva" className="km-primary"><Plus size={16} aria-hidden/>Nueva solicitud</Link>}</div>
    {isAdmin && <form action="/solicitudes" className="km-panel mb-6 flex flex-wrap items-end gap-3 p-4"><label className="min-w-0 text-xs font-semibold text-secondary">Vendedor<select name="vendedor" defaultValue={selectedSeller} className="km-input mt-2 block max-w-full"><option value="">Todos los vendedores</option>{sellers.map(seller => <option key={seller.id} value={seller.id}>{seller.name}</option>)}</select></label><button className="km-primary">Filtrar solicitudes</button>{selectedSeller && <Link href="/solicitudes" className="km-secondary">Ver todas</Link>}</form>}
    {notice && <p role={noticeError ? "alert" : "status"} className={`mb-4 rounded-lg border px-4 py-3 text-sm ${noticeError ? "border-warning-line bg-warning-soft text-warning" : "border-positive-line bg-positive-soft text-positive"}`}>{notice}</p>}
    {failed ? <section role="alert" className="rounded-xl border border-warning-line bg-warning-soft p-5 text-sm text-warning">No fue posible cargar las solicitudes. Verifica tu permiso y el servicio local.</section> : <div className="space-y-7">
      <section aria-labelledby="pending-applications-title" className="km-panel overflow-hidden border-accent-line">
        <PanelHeading title="Solicitudes pendientes" id="pending-applications-title" description={<>Por evaluar o esperando documentación.</>} icon={Clock3}><span aria-label={`${pendingCount} solicitudes pendientes`} className="grid min-h-10 min-w-10 shrink-0 place-items-center rounded-xl bg-blue-700 px-3 text-lg font-bold tabular-nums text-white">{pendingCount.toLocaleString("es-DO")}</span></PanelHeading>
        {pendingRows.length ? <ApplicationRows rows={pendingRows} customerNames={names} showCreator={isAdmin}/> : <EmptyState title={pendingCount ? "No hay solicitudes en esta página" : "Todo al día"} description={pendingCount ? "Vuelve a la primera página para consultar las solicitudes pendientes." : "No hay solicitudes pendientes de evaluación ni de documentación."} href={pendingCount ? applicationHref(1,historyPage,selectedSeller) : undefined} action="Ver pendientes"/>}
        {pendingCount > 0 && <ApplicationPagination group="pending" current={pendingPage} total={pendingPages} pendingPage={pendingPage} historyPage={historyPage} seller={selectedSeller}/>}
      </section>
      <section aria-labelledby="history-applications-title" className="km-panel overflow-hidden">
        <PanelHeading title="Solicitudes evaluadas" id="history-applications-title" description={<>Aprobadas y rechazadas.</>} icon={CheckCheck}><span aria-label={`${historyCount} solicitudes evaluadas`} className="rounded-lg bg-soft px-3 py-1.5 text-sm font-semibold tabular-nums text-secondary">{historyCount.toLocaleString("es-DO")}</span></PanelHeading>
        {historyRows.length ? <ApplicationRows rows={historyRows} customerNames={names} showCreator={isAdmin}/> : <EmptyState title={historyCount ? "No hay solicitudes en esta página" : "Todavía no hay decisiones"} description={historyCount ? "Vuelve a la primera página para consultar las solicitudes evaluadas." : "Las solicitudes aprobadas o rechazadas aparecerán aquí."} href={historyCount ? applicationHref(pendingPage,1,selectedSeller) : undefined} action="Ver evaluadas"/>}
        {historyCount > 0 && <ApplicationPagination group="history" current={historyPage} total={historyPages} pendingPage={pendingPage} historyPage={historyPage} seller={selectedSeller}/>}
      </section>
    </div>}
  </main></div>;
}
