import Link from "next/link";
import { ArrowLeft, Smartphone } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { getTenantAccess } from "@/lib/security/tenant-access";
import { buildDeviceHistory, deviceHistoryDate, deviceHistorySelect, type DeviceRecord } from "@/modules/devices/history";
import { DeviceHistory } from "@/modules/devices/device-history";

export default async function DeviceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
  const access = await getTenantAccess("devices.read");
  if (!access.ok && access.reason === "unauthenticated") redirect("/login");
  const result = access.ok ? await access.supabase.from("devices").select(deviceHistorySelect).eq("id", id).eq("tenant_id", access.membership.tenant_id).maybeSingle() : null;
  if (access.ok && result && !result.error && !result.data) notFound();
  const device = result?.data as unknown as DeviceRecord | null;

  return <div className="min-h-screen bg-canvas"><Sidebar/><Topbar/><main id="main-content" tabIndex={-1} className="km-main px-4 pb-10 pt-7 sm:px-7 lg:ml-[244px] lg:px-7"><Link href="/dispositivos" className="mb-5 inline-flex min-h-10 items-center gap-2 text-xs font-semibold text-accent"><ArrowLeft size={15} aria-hidden/>Volver a dispositivos</Link>
    {!access.ok || result?.error || !device ? <p role="alert" className="rounded-xl border border-warning-line bg-warning-soft p-4 text-sm text-warning">{!access.ok && access.reason !== "unavailable" ? "Tu usuario no tiene acceso para consultar dispositivos." : "No se pudo cargar el historial del equipo. Intenta de nuevo."}</p> : <div className="km-panel mx-auto max-w-3xl p-5 sm:p-7">
      <div className="flex items-center gap-4"><span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent"><Smartphone size={32} strokeWidth={1.6} aria-hidden/></span><div className="min-w-0"><p className="text-sm text-muted">{device.brand}</p><h1 className="mt-1 break-words text-2xl font-bold tracking-tight">{device.model}</h1><p className="mt-1 text-xs text-muted">Expediente documental del dispositivo</p></div></div>
      <dl className="mt-6 grid gap-4 rounded-xl bg-subtle p-4 sm:grid-cols-2"><div><dt className="text-xs text-muted">IMEI</dt><dd className="mt-1 select-all break-all font-mono text-sm">{device.imei}</dd></div><div><dt className="text-xs text-muted">Número de serie</dt><dd className="mt-1 break-all text-sm text-secondary">{device.serial_number || "No registrado"}</dd></div><div><dt className="text-xs text-muted">Registrado en dispositivos</dt><dd className="mt-1 text-sm text-secondary"><time dateTime={device.created_at}>{deviceHistoryDate(device.created_at)}</time></dd></div></dl>
      <h2 className="mt-7 text-base font-bold">Historial de clientes y entregas</h2><p className="mb-4 mt-1 text-xs leading-5 text-muted">Conserva la solicitud asociada, el cliente y la entrega registrada para consultas futuras.</p><DeviceHistory entries={buildDeviceHistory(device)}/>
    </div>}
  </main></div>;
}
