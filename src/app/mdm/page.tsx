import Link from "next/link";
import { redirect } from "next/navigation";
import { LockKeyhole, Search } from "lucide-react";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { PreservedActionForm } from "@/components/forms/preserved-action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Feedback } from "@/components/ui/feedback";
import { PanelHeading } from "@/components/ui/panel-heading";
import { getTenantAccess } from "@/lib/security/tenant-access";
import { confirmManualMdm } from "@/modules/mdm/actions";
import { MdmConfirmationFields, MdmWorkItemCard } from "@/modules/mdm/work-item-card";
import { mdmActions, mdmActionLabels, mdmHref, mdmTabs, type MdmEntry } from "@/modules/mdm/work-items";

const messages = {
  invalid: "Confirma que ya realizaste la acción y revisa la referencia.",
  stale: "El estado de este equipo cambió. Actualiza la cola antes de continuar.",
  forbidden: "Tu usuario no puede confirmar acciones para este financiamiento.",
  "save-error": "No se pudo guardar la confirmación. Intenta de nuevo.",
};

export default async function MdmPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; page?: string; completada?: string }> }) {
  const [access, params] = await Promise.all([getTenantAccess("mdm.manual"), searchParams]);
  if (!access.ok && access.reason === "unauthenticated") redirect("/login");
  const tab = mdmTabs.find((entry) => entry.key === params.tab) ?? mdmTabs[0];
  const search = typeof params.q === "string" ? params.q.trim().slice(0, 80) : "";
  const page = Math.max(1, Math.min(100000, Number.parseInt(params.page ?? "1", 10) || 1));
  const completed = mdmActions.find((entry) => entry === params.completada);

  const result = access.ok ? await access.supabase.rpc("manual_mdm_list", {
    p_tenant_id: access.membership.tenant_id, p_tab: tab.key, p_search: search, p_page: page,
  }) : null;
  const data = result?.data as { count: number; rows: MdmEntry[] } | null;
  const pages = Math.max(1, Math.ceil((data?.count ?? 0) / 30));
  if (data && page > pages) redirect(mdmHref(tab.key, search, pages));

  return <div className="min-h-screen bg-canvas">
    <Sidebar/><Topbar/>
    <main id="main-content" tabIndex={-1} className="km-main space-y-5 px-4 pb-10 pt-7 sm:px-7 lg:ml-[244px]">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="km-page-title">MDM</h1><p className="mt-1 text-sm text-muted">Cola de enrolamiento, bloqueo y desbloqueo para el programador.</p></div>
        <div className="flex flex-wrap items-center gap-2">
          {access.ok && access.membership.role === "tenant_admin" && <Link href="/historial-mdm" className="km-secondary">Historial anterior</Link>}
          <Link href="/mdm/demo" className="km-secondary">Probar con demos</Link>
        </div>
      </header>
      <Feedback>Realiza la acción en tu herramienta MDM y luego confírmala aquí. Actualiza la cola antes de bloquear, ya que un pago puede cambiar la tarea.</Feedback>
      {access.ok && completed && <Feedback tone="success">Acción guardada. Puedes consultarla en Completadas.</Feedback>}
      {!access.ok ? <Feedback tone="error">{access.reason === "unavailable" ? "No se pudo verificar tu acceso." : "Tu usuario necesita acceso de Programador MDM o Administrador."}</Feedback> : <>
        <nav aria-label="Colas de MDM" className="flex flex-wrap gap-2">
          {mdmTabs.map(({ key, label }) => <Link key={key} href={mdmHref(key, search)} aria-current={key === tab.key ? "page" : undefined} className={key === tab.key ? "km-primary" : "km-secondary"}>{label}</Link>)}
          <a href={mdmHref(tab.key, search, page)} className="km-secondary">Actualizar cola</a>
        </nav>
        <section className="km-panel min-w-0 overflow-hidden">
          <PanelHeading title={data ? `${tab.label} · ${data.count.toLocaleString("es-DO")}` : tab.label} description={tab.description} icon={LockKeyhole}>
            <form action="/mdm" className="flex w-full gap-2 sm:w-auto">
              <input type="hidden" name="tab" value={tab.key}/>
              <input type="search" name="q" aria-label="Buscar equipo o cliente" placeholder="Cliente, equipo o IMEI" maxLength={80} defaultValue={search} className="km-input min-w-0 flex-1"/>
              <button type="submit" className="km-secondary"><Search size={16} aria-hidden/>Buscar</button>
            </form>
          </PanelHeading>
          {result?.error || !data ? <Feedback tone="error" className="m-4">No se pudo cargar la cola MDM. Actualiza la página para intentarlo de nuevo.</Feedback> : data.rows.length ? <div className="divide-y divide-line">
            {data.rows.map((item) => <MdmWorkItemCard key={`${tab.key}-${item.id}-${item.previous_event_id ?? "first"}`} item={item}>
              <PreservedActionForm action={confirmManualMdm} messages={messages} className="space-y-2 rounded-lg border border-line bg-subtle p-3">
                <input type="hidden" name="loanId" value={item.loan_id}/>
                <input type="hidden" name="action" value={item.action}/>
                <input type="hidden" name="previousEventId" value={item.previous_event_id ?? ""}/>
                <input type="hidden" name="search" value={search}/>
                <MdmConfirmationFields action={item.action}/>
                <SubmitButton className="km-primary w-full">{mdmActionLabels[item.action].confirm}</SubmitButton>
              </PreservedActionForm>
            </MdmWorkItemCard>)}
          </div> : <EmptyState search={Boolean(search)} title={search ? "No encontramos coincidencias" : "La cola está al día"} description={search ? "Prueba con otro nombre, modelo o IMEI." : tab.description} href={search ? mdmHref(tab.key) : undefined} action="Limpiar búsqueda"/>}
          {pages > 1 && <nav aria-label="Paginación de la cola MDM" className="flex items-center justify-between gap-2 border-t border-line p-4 text-xs">
            {page > 1 ? <Link className="km-secondary" href={mdmHref(tab.key, search, page - 1)}>Anterior</Link> : <span/>}
            <span>Página {page} de {pages}</span>
            {page < pages ? <Link className="km-secondary" href={mdmHref(tab.key, search, page + 1)}>Siguiente</Link> : <span/>}
          </nav>}
        </section>
      </>}
    </main>
  </div>;
}
