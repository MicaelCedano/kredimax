import Link from "next/link";
import { Activity, ArrowRight, Banknote, CircleAlert, ClipboardList, CreditCard, Plus, Smartphone, Users } from "lucide-react";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { CollectionsChart } from "@/components/dashboard/collections-chart";
import { formatDop } from "@/lib/format-money";
import { CustomerLabel } from "@/components/ui/status-badge";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { PermissionGate } from "@/components/dashboard/navigation-context";

export type DashboardData = {
  company: string;
  branch: string;
  counts: { customers: number; devices: number; applications: number; activeLoans: number; overdue: number };
  money: { activeBalance: string | number; received: string | number; overdue: string | number; collectionRate: number };
  upcoming: { customer: string; device: string; dueDate: string; amount: string | number; status: string }[];
  recent: { title: string; detail: string; date: string; amount: string | number | null }[];
  chart: { month: string; amount: number }[];
};

export function Dashboard({ data, mode }: { data: DashboardData; mode: "live" | "demo" | "error" }) {
  const cards = [
    { title: "Saldo de cuotas activas", value: formatDop(data.money.activeBalance), icon: Banknote },
    { title: "Cobros registrados", value: formatDop(data.money.received), icon: CreditCard },
    { title: "Clientes", value: data.counts.customers.toLocaleString("es-DO"), icon: Users },
    { title: "Financiamientos activos", value: data.counts.activeLoans.toLocaleString("es-DO"), icon: Smartphone },
  ];
  const rate = Math.min(100, Math.max(0, data.money.collectionRate));
  const dateLabel = (date: string) => new Intl.DateTimeFormat("es-DO", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
  return <div className="min-h-screen bg-canvas">
    <Sidebar/><Topbar/>
    <main id="main-content" tabIndex={-1} className="km-main px-4 pb-10 pt-7 sm:px-7 lg:ml-[244px]">
      <PageHeader title="Resumen de cartera" description={<>{data.company} · {data.branch}</>} actions={<PermissionGate permission="financing.write"><Link href="/solicitudes/nueva" className="km-primary"><Plus size={18} aria-hidden/>Nueva solicitud</Link></PermissionGate>}/>
      {mode !== "live" && <p role="status" className="mb-5 rounded-xl border border-warning-line bg-warning-soft px-4 py-3 text-sm text-warning">{mode === "error" ? "No se pudieron cargar los datos; cifras de ejemplo." : "Datos de demostración."}</p>}
      <div className="mb-5 grid grid-cols-2 gap-4 xl:grid-cols-4">
        {cards.map((card, index) => <StatCard key={card.title} {...card} featured={index === 0} compact={index > 1}/>)}
      </div>
      <div className="mb-5 grid gap-4 xl:grid-cols-[minmax(0,1.85fr)_minmax(300px,1fr)]">
        <section className="km-panel min-w-0 p-5"><div className="mb-4 flex items-center justify-between gap-2"><h2 className="text-[15px] font-bold">Cobros mensuales · 12 meses</h2><span className="text-xs text-muted">DOP</span></div><CollectionsChart data={data.chart}/><p className="mt-3 text-[11px] text-muted">{mode === "live" ? "Suma de pagos vigentes registrados." : "Serie ilustrativa."}</p></section>
        <section className="km-panel flex flex-col p-5"><div className="flex items-center justify-between gap-2"><h2 className="text-[15px] font-bold">Cuotas vencidas</h2><CircleAlert size={19} className="text-danger" aria-hidden/></div><div className="my-7 grid grid-cols-[.7fr_1fr] gap-4"><div><p className="km-amount text-4xl font-bold tracking-tight text-danger">{data.counts.overdue.toLocaleString("es-DO")}</p><p className="mt-2 text-xs text-muted">Cuotas vencidas</p></div><div className="min-w-0 border-l border-line pl-4"><p className="km-amount break-words text-[23px] font-bold tracking-tight text-danger">{formatDop(data.money.overdue)}</p><p className="mt-2 text-xs text-muted">Saldo vencido</p></div></div><div className="border-t border-line pt-5"><div className="flex justify-between gap-3 text-xs text-muted"><span>Tasa de cuotas pagadas este mes</span><b className="text-ink">{data.money.collectionRate}%</b></div><div role="progressbar" aria-label="Tasa de cuotas pagadas este mes" aria-valuenow={rate} aria-valuemin={0} aria-valuemax={100} className="mt-3 h-2 overflow-hidden rounded-full bg-soft"><div className="h-full rounded-full bg-brand" style={{ width: `${rate}%` }}/></div></div><Link href="/cobros" className="mt-auto flex items-center gap-2 pt-6 text-xs font-semibold text-accent">Ir a cobros<ArrowRight size={14} aria-hidden/></Link></section>
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(330px,1fr)]">
        <section className="km-panel min-w-0 overflow-hidden"><div className="flex items-start justify-between gap-3 p-5"><div><h2 className="text-[15px] font-bold">Próximas cuotas</h2><p className="mt-1.5 text-xs text-muted">Vencen en los próximos siete días</p></div><Link href="/cobros" className="shrink-0 text-xs font-semibold text-accent hover:underline">Ver todas</Link></div>
          {data.upcoming.length ? <><div className="divide-y divide-line px-5 pb-2 md:hidden">{data.upcoming.map((row,index)=><div key={`${row.dueDate}-${index}`} className="py-4"><CustomerLabel name={row.customer}/><p className="mt-2 text-xs text-muted">{row.device}</p><div className="mt-3 flex items-center justify-between gap-3 text-xs"><span className="text-muted">{dateLabel(row.dueDate)}</span><span className="km-amount text-sm font-bold">{formatDop(row.amount)}</span></div></div>)}</div><div className="hidden overflow-x-auto md:block"><table className="km-table min-w-[570px]"><thead><tr><th>Cliente / equipo</th><th>Vence</th><th className="text-right">Saldo</th></tr></thead><tbody>{data.upcoming.map((row,index)=><tr key={`${row.dueDate}-${index}`}><td><CustomerLabel name={row.customer}/><p className="ml-12 mt-1 text-xs text-muted">{row.device}</p></td><td className="whitespace-nowrap text-xs text-muted">{dateLabel(row.dueDate)}</td><td className="km-amount whitespace-nowrap text-right font-semibold">{formatDop(row.amount)}</td></tr>)}</tbody></table></div></> : <EmptyState title="No hay cuotas próximas" description="Aquí verás las cuotas que vencen en los próximos siete días."/>}
        </section>
        <section className="km-panel min-w-0 p-5"><div className="mb-3 flex items-start justify-between gap-3"><div><h2 className="text-[15px] font-bold">Actividad reciente</h2><p className="mt-1.5 text-xs text-muted">Últimos cobros y solicitudes</p></div><Activity size={18} className="text-muted" aria-hidden/></div><div className="divide-y divide-line">{data.recent.length ? data.recent.map((item,index)=><div key={`${item.title}-${item.date}-${index}`} className="flex items-start gap-3 py-4"><span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl ${item.amount === null ? "bg-accent-soft text-accent" : "bg-positive-soft text-positive"}`}>{item.amount === null ? <Activity size={17} aria-hidden/> : <CreditCard size={17} aria-hidden/>}</span><div className="min-w-0 flex-1"><p className="text-xs font-semibold text-ink">{item.title}</p><p className="mt-1 break-words text-xs text-muted">{item.detail}</p><p className="mt-1.5 text-[11px] text-muted">{new Date(item.date).toLocaleString("es-DO", { dateStyle: "short", timeStyle: "short", timeZone: "America/Santo_Domingo" })}</p></div>{item.amount !== null && <p className="km-amount shrink-0 pt-0.5 text-xs font-semibold text-positive">{formatDop(item.amount)}</p>}</div>) : <EmptyState title="No hay actividad para mostrar" description="Los cobros y las solicitudes aparecerán aquí cuando se registren."/>}</div></section>
      </div>
      <section className="km-panel mt-5 p-5" aria-labelledby="quick-links-title"><h2 id="quick-links-title" className="mb-4 text-[15px] font-semibold">Accesos rápidos</h2><div className="grid gap-3 sm:grid-cols-2"><PermissionGate permission="financing.read"><Link href="/solicitudes" className="km-shortcut"><span className="km-stat-icon"><ClipboardList size={20} aria-hidden/></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">Solicitudes</span><span className="mt-1 block text-xs text-muted">{data.counts.applications.toLocaleString("es-DO")} registradas en tu alcance</span></span><ArrowRight size={17} className="text-muted" aria-hidden/></Link></PermissionGate><PermissionGate permission="customers.read"><Link href="/clientes" className="km-shortcut"><span className="km-stat-icon"><Users size={20} aria-hidden/></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">Clientes</span><span className="mt-1 block text-xs text-muted">Consultar expedientes e historial</span></span><ArrowRight size={17} className="text-muted" aria-hidden/></Link></PermissionGate></div></section>
      {mode !== "live" && <p className="mt-6 text-center text-xs text-muted">Las cifras visibles son datos ficticios y no representan una cartera real.</p>}
    </main>
  </div>;
}

