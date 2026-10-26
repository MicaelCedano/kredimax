import Link from "next/link";
import { PanelHeading } from "@/components/ui/panel-heading";
import { SubmitButton } from "@/components/forms/submit-button";
import { ArrowUpRight, Search, Smartphone } from "lucide-react";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { PreservedActionForm } from "@/components/forms/preserved-action-form";
import { getTenantAccess } from "@/lib/security/tenant-access";
import { sanitizeSearchTerm } from "@/lib/validation/search-term";
import { createDevice } from "@/modules/devices/actions";

import { EmptyState } from "@/components/ui/empty-state";

const messages: Record<string, string> = {
  creado: "El dispositivo se agregó al inventario.", actualizado: "Los cambios se guardaron.", invalid: "Revisa los campos. El IMEI debe tener 15 dígitos y superar su validación de control.",
  duplicate: "Ese IMEI ya está registrado para esta empresa.", "save-error": "No se pudo guardar el dispositivo.", "no-membership": "Tu usuario aún no tiene una membresía activa.", "branch-required": "Selecciona una sucursal activa permitida para guardar este dispositivo.",
  "tenant-selection-required": "Tu usuario pertenece a más de una empresa; hay que elegir una antes de continuar.", forbidden: "Tu rol no tiene permiso para consultar o administrar dispositivos.",
  unavailable: "No se pudo consultar el servicio local. Verifica que Supabase esté iniciado.", "not-found": "No se encontró el dispositivo o ya no tienes acceso a él.",
};

function Notice({ state }: { state?: string }) {
  if (!state || !messages[state]) return null;
  const isError = !["creado", "actualizado"].includes(state);
  return <p role={isError ? "alert" : "status"} className={`mb-4 rounded-lg border px-4 py-3 text-sm ${isError ? "border-danger-line bg-danger-soft text-danger" : "border-positive-line bg-positive-soft text-positive"}`}>{messages[state]}</p>;
}

export default async function DevicesPage({ searchParams }: { searchParams: Promise<{ q?: string; estado?: string; page?: string }> }) {
  const { q = "", estado, page: rawPage } = await searchParams;
  const page = Math.max(1, Math.min(100000, Number.parseInt(rawPage ?? "1", 10) || 1));
  const pageSize = 50;
  const searchTerm = sanitizeSearchTerm(q);
  const [access, writeAccess] = await Promise.all([getTenantAccess("devices.read"), getTenantAccess("devices.write")]);
  if (!access.ok && access.reason === "unauthenticated") redirect("/login");
  const branchResult = access.ok ? await access.supabase.from("branches").select("id,name").eq("tenant_id", access.membership.tenant_id).order("name") : { data: [], error: null };
  const branches = branchResult.data ?? [];
  const defaultBranchId = access.ok ? access.membership.branch_id ?? (branches.length === 1 ? branches[0].id : "") : "";
  const assignedBranchId = access.ok && access.membership.role !== "tenant_admin" ? access.membership.branch_id : null;
  let data = null; let error = null; let count = 0;
  if (access.ok) {
    let query = access.supabase.from("devices").select("id, imei, brand, model, serial_number, enrollment_status, created_at", { count: "exact" }).eq("tenant_id", access.membership.tenant_id);
    if (searchTerm) query = query.or(`imei.ilike.%${searchTerm}%,brand.ilike.%${searchTerm}%,model.ilike.%${searchTerm}%,serial_number.ilike.%${searchTerm}%`);
    const result = await query.order("created_at", { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1);
    data = result.data; error = result.error; count = result.count ?? 0;
  }
  const rows = data ?? [];
  const totalPages = Math.max(1, Math.ceil(count / pageSize));
  const state = access.ok ? (error ? "unavailable" : estado) : access.reason;

  return <div className="min-h-screen bg-canvas"><Sidebar/><Topbar/><main id="main-content" tabIndex={-1} className="km-main px-4 pb-10 pt-7 sm:px-7 lg:ml-[244px] lg:px-7">
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3"><div><h1 className="km-page-title">Dispositivos</h1><p className="mt-1 text-sm text-muted">Consulta tus equipos por marca, modelo o IMEI.</p></div><div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-xs text-secondary"><Smartphone size={15}/>{access.ok ? `${count.toLocaleString("es-DO")} ${count === 1 ? "resultado" : "resultados"}` : "Acceso pendiente"}</div></div>
    <Notice state={state}/><div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <section className="km-panel min-w-0 overflow-hidden"><PanelHeading title="Inventario" description={<>Página {page} de {totalPages} · búsqueda en toda la empresa.</>}><form className="relative w-full sm:w-64"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"/><input aria-label="Buscar dispositivos" name="q" defaultValue={q} placeholder="Buscar IMEI, marca o modelo" className="km-input w-full pl-9"/></form></PanelHeading>
        {!access.ok || error ? <div className="px-5 py-12 text-center text-sm text-muted">No fue posible cargar el inventario.</div> : rows.length ? <><div className="divide-y divide-line px-5 md:hidden">{rows.map(row=><article key={row.id} className="py-5"><div className="flex items-center gap-3"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent"><Smartphone size={23} strokeWidth={1.6} aria-hidden/></span><div className="min-w-0"><p className="text-xs text-muted">{row.brand}</p><h3 className="mt-0.5 break-words text-base font-semibold">{row.model}</h3></div></div><dl className="mt-4 grid grid-cols-2 gap-4 text-xs"><div className="col-span-2"><dt className="text-muted">IMEI</dt><dd className="mt-1 select-all break-all font-mono text-sm text-secondary">{row.imei}</dd></div><div><dt className="text-muted">Número de serie</dt><dd className="mt-1 break-words text-secondary">{row.serial_number || "No registrado"}</dd></div><div><dt className="text-muted">Inscripción MDM</dt><dd className="mt-1 text-secondary">{row.enrollment_status === "enrolled" ? "Inscrito" : row.enrollment_status === "not_enrolled" ? "No inscrito" : row.enrollment_status}</dd></div></dl><Link href={`/dispositivos/${row.id}`} className="mt-4 inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-accent">Ver equipo<ArrowUpRight size={15} aria-hidden/></Link></article>)}</div><div className="hidden overflow-x-auto md:block"><table className="km-table min-w-[700px]"><thead className="bg-subtle text-muted"><tr><th className="px-5 py-3 font-semibold">Dispositivo</th><th className="px-4 py-3 font-semibold">IMEI</th><th className="px-4 py-3 font-semibold">Serie</th><th className="px-4 py-3 font-semibold">Inscripción</th><th className="px-5 py-3 text-right font-semibold">Acción</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-t border-line"><td className="px-5 py-3.5 font-semibold text-ink"><span className="flex items-center gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent"><Smartphone size={21} strokeWidth={1.6} aria-hidden/></span><span><span className="block text-xs font-medium text-muted">{row.brand}</span><span className="mt-0.5 block text-sm font-semibold">{row.model}</span></span></span></td><td className="px-4 py-3.5 font-mono text-secondary">{row.imei}</td><td className="px-4 py-3.5 text-secondary">{row.serial_number || "—"}</td><td className="px-4 py-3.5"><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${row.enrollment_status === "enrolled" ? "bg-positive-soft text-positive" : "bg-soft text-secondary"}`}>{row.enrollment_status === "enrolled" ? "Inscrito" : row.enrollment_status === "not_enrolled" ? "No inscrito" : row.enrollment_status}</span></td><td className="px-5 py-3.5 text-right"><Link href={`/dispositivos/${row.id}`} className="inline-flex min-h-10 items-center gap-1 text-xs font-semibold text-accent hover:underline">Ver equipo<ArrowUpRight size={14} aria-hidden/></Link></td></tr>)}</tbody></table></div><nav aria-label="Paginación de dispositivos" className="flex items-center justify-between border-t border-line px-5 py-3 text-xs"><Link aria-disabled={page<=1} className={page<=1?"pointer-events-none text-muted":"font-semibold text-accent"} href={`/dispositivos?q=${encodeURIComponent(q)}&page=${page-1}`}>Anterior</Link><span>Página {page} de {totalPages}</span><Link aria-disabled={page>=totalPages} className={page>=totalPages?"pointer-events-none text-muted":"font-semibold text-accent"} href={`/dispositivos?q=${encodeURIComponent(q)}&page=${page+1}`}>Siguiente</Link></nav></> : <EmptyState search={Boolean(q)} title={q ? "No encontramos ese equipo" : "Tu inventario está vacío"} description={q ? "Prueba con el IMEI completo, la marca o el modelo del dispositivo." : "Registra tu primer equipo para comenzar a organizar el inventario."} href={q ? "/dispositivos" : undefined} action="Limpiar búsqueda"/>}
      </section>
      <section className="km-panel h-fit p-5"><PanelHeading title="Agregar dispositivo" description="Completa los datos del equipo." icon={Smartphone} inset="compact"/>{writeAccess.ok ? branches.length ? <PreservedActionForm action={createDevice} className="space-y-3" messages={{invalid:"Revisa el IMEI y los datos del equipo; se conservaron los campos.",duplicate:"Ese IMEI ya existe. Verifica el equipo antes de reintentar.", "save-error":"No se pudo guardar el dispositivo. Tus datos siguen en el formulario.", "branch-required":"Selecciona una sucursal permitida.", forbidden:"No tienes permiso para guardar en esa sucursal.", unavailable:"No se pudo verificar el servicio; vuelve a intentar."}}><label className="block text-sm font-semibold text-secondary">Sucursal *<select name="branchId" required defaultValue={defaultBranchId} disabled={Boolean(assignedBranchId)} className="km-input mt-1.5 w-full rounded-lg border border-field-border bg-surface px-3 py-2.5 text-sm font-normal disabled:bg-subtle"><option value="" disabled>Selecciona una sucursal</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>{assignedBranchId && <input type="hidden" name="branchId" value={assignedBranchId}/>}</label><label className="block text-sm font-semibold text-secondary">IMEI (15 dígitos) *<input required name="imei" inputMode="numeric" pattern="[0-9]{15}" maxLength={15} minLength={15} className="km-input mt-1.5 w-full rounded-lg border border-field-border px-3 py-2.5 font-mono text-sm font-normal"/></label><label className="block text-sm font-semibold text-secondary">Marca *<input required name="brand" maxLength={80} className="km-input mt-1.5 w-full rounded-lg border border-field-border px-3 py-2.5 text-sm font-normal"/></label><label className="block text-sm font-semibold text-secondary">Modelo *<input required name="model" maxLength={120} className="km-input mt-1.5 w-full rounded-lg border border-field-border px-3 py-2.5 text-sm font-normal"/></label><label className="block text-sm font-semibold text-secondary">Número de serie<input name="serialNumber" maxLength={120} className="km-input mt-1.5 w-full rounded-lg border border-field-border px-3 py-2.5 text-sm font-normal"/></label><p className="text-[11px] leading-5 text-muted">MDM está desactivado. La inscripción mostrada es informativa.</p><SubmitButton className="km-primary w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">Agregar al inventario</SubmitButton></PreservedActionForm> : <p role="alert" className="rounded-lg bg-warning-soft p-3 text-xs leading-5 text-warning">No hay sucursales visibles para asignar el dispositivo.</p> : <p className="rounded-lg bg-subtle p-3 text-xs leading-5 text-secondary">Tu rol permite consultar, pero no administrar el inventario.</p>}</section>
    </div>
  </main></div>;
}

