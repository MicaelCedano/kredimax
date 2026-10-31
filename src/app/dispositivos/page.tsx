import Link from "next/link";
import { ArrowUpRight, Search, Smartphone } from "lucide-react";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { PanelHeading } from "@/components/ui/panel-heading";
import { EmptyState } from "@/components/ui/empty-state";
import { getTenantAccess } from "@/lib/security/tenant-access";
import { sanitizeSearchTerm } from "@/lib/validation/search-term";
import { buildDeviceHistory, deviceHistoryDate, deviceHistorySelect, type DeviceRecord } from "@/modules/devices/history";
import { DeviceHistory } from "@/modules/devices/device-history";

export default async function DevicesPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const { q = "", page: rawPage } = await searchParams;
  const page = Math.max(1, Math.min(100000, Number.parseInt(rawPage ?? "1", 10) || 1));
  const pageSize = 50;
  const searchTerm = sanitizeSearchTerm(q);
  const access = await getTenantAccess("devices.read");
  if (!access.ok && access.reason === "unauthenticated") redirect("/login");
  let rows: DeviceRecord[] = [];
  let unavailable = false;
  let count = 0;
  if (access.ok) {
    let query = access.supabase.from("devices").select(deviceHistorySelect, { count: "exact" }).eq("tenant_id", access.membership.tenant_id);
    if (searchTerm) query = query.or(`imei.ilike.%${searchTerm}%,brand.ilike.%${searchTerm}%,model.ilike.%${searchTerm}%,serial_number.ilike.%${searchTerm}%`);
    const result = await query.order("created_at", { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1);
    rows = (result.data ?? []) as unknown as DeviceRecord[];
    unavailable = Boolean(result.error);
    count = result.count ?? 0;
  }
  const totalPages = Math.max(1, Math.ceil(count / pageSize));
  const records = rows.map((device) => ({ device, history: buildDeviceHistory(device) }));

  return <div className="min-h-screen bg-canvas"><Sidebar/><Topbar/><main id="main-content" tabIndex={-1} className="km-main px-4 pb-10 pt-7 sm:px-7 lg:ml-[244px] lg:px-7">
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3"><div><h1 className="km-page-title">Dispositivos</h1><p className="mt-1 text-sm text-muted">Historial documental de equipos, clientes y entregas.</p></div><span className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-xs text-secondary"><Smartphone size={15} aria-hidden/>{access.ok ? `${count.toLocaleString("es-DO")} ${count === 1 ? "equipo" : "equipos"}` : "Acceso pendiente"}</span></div>
    <p className="mb-4 rounded-lg border border-line bg-surface px-4 py-3 text-sm leading-6 text-secondary">Los equipos se agregan automáticamente al guardar una solicitud. Aquí puedes consultar a qué cliente se asociaron y cuándo se registró su entrega.</p>
    <section className="km-panel min-w-0 overflow-hidden"><PanelHeading title="Historial de dispositivos" description={<>Página {page} de {totalPages} · registros según tu acceso.</>}><form className="flex w-full gap-2 sm:w-auto"><div className="relative min-w-0 flex-1"><Search size={15} aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"/><input aria-label="Buscar dispositivos" name="q" defaultValue={q} placeholder="IMEI, serie, marca o modelo" className="km-input w-full pl-9"/></div><button type="submit" className="km-primary px-3 text-xs font-semibold">Buscar</button></form></PanelHeading>
      {!access.ok || unavailable ? <p role="alert" className="px-5 py-12 text-center text-sm text-muted">{unavailable || (!access.ok && access.reason === "unavailable") ? "No fue posible cargar el historial. Intenta de nuevo." : "Tu usuario no tiene acceso para consultar dispositivos."}</p> : records.length ? <>
        <div className="divide-y divide-line px-5 md:hidden">{records.map(({ device, history }) => <article key={device.id} className="space-y-4 py-5"><div><p className="text-xs text-muted">{device.brand}</p><h2 className="mt-1 break-words text-base font-semibold">{device.model}</h2><p className="mt-2 select-all break-all font-mono text-sm text-secondary">IMEI {device.imei}</p></div><DeviceHistory entries={history} compact/><Link href={`/dispositivos/${device.id}`} className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-accent">Ver historial<ArrowUpRight size={15} aria-hidden/></Link></article>)}</div>
        <div className="hidden overflow-x-auto md:block"><table className="km-table min-w-[760px]"><thead className="bg-subtle text-muted"><tr><th className="px-5 py-3 font-semibold">Equipo</th><th className="px-4 py-3 font-semibold">IMEI / Serie</th><th className="px-4 py-3 font-semibold">Cliente / Entrega</th><th className="px-4 py-3 font-semibold">Registrado</th><th className="px-5 py-3 text-right font-semibold">Consulta</th></tr></thead><tbody>{records.map(({ device, history }) => <tr key={device.id} className="border-t border-line"><td className="px-5 py-4"><p className="text-xs text-muted">{device.brand}</p><p className="mt-1 font-semibold">{device.model}</p></td><td className="px-4 py-4"><p className="select-all font-mono text-secondary">{device.imei}</p><p className="mt-1 text-xs text-muted">Serie: {device.serial_number || "No registrada"}</p></td><td className="max-w-sm px-4 py-4"><DeviceHistory entries={history} compact/></td><td className="px-4 py-4 text-xs text-secondary"><time dateTime={device.created_at}>{deviceHistoryDate(device.created_at)}</time></td><td className="px-5 py-4 text-right"><Link href={`/dispositivos/${device.id}`} className="inline-flex min-h-10 items-center gap-1 text-xs font-semibold text-accent hover:underline">Ver historial<ArrowUpRight size={14} aria-hidden/></Link></td></tr>)}</tbody></table></div>
        <nav aria-label="Paginación de dispositivos" className="flex items-center justify-between border-t border-line px-5 py-3 text-xs"><Link aria-disabled={page <= 1} className={page <= 1 ? "pointer-events-none text-muted" : "font-semibold text-accent"} href={`/dispositivos?q=${encodeURIComponent(q)}&page=${page - 1}`}>Anterior</Link><span>Página {page} de {totalPages}</span><Link aria-disabled={page >= totalPages} className={page >= totalPages ? "pointer-events-none text-muted" : "font-semibold text-accent"} href={`/dispositivos?q=${encodeURIComponent(q)}&page=${page + 1}`}>Siguiente</Link></nav>
      </> : <EmptyState search={Boolean(q)} title={q ? "No encontramos ese equipo" : "Aún no hay dispositivos registrados"} description={q ? "Prueba con el IMEI, la serie, la marca o el modelo." : "Los equipos aparecerán aquí automáticamente cuando guardes una solicitud."} href={q ? "/dispositivos" : undefined} action="Limpiar búsqueda"/>}
    </section>
  </main></div>;
}
