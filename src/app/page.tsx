import { Dashboard, type DashboardData } from "@/components/dashboard/dashboard";
import { getTenantAccess } from "@/lib/security/tenant-access";
import { DEFAULT_DASHBOARD_DATA } from "@/lib/dashboard/demo-data";
import { DashboardAccessState, resolveDashboardAccessState } from "@/lib/dashboard/access-state";
import { isDashboardSummary } from "@/lib/dashboard/summary-validation";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import Link from "next/link";
import { redirect } from "next/navigation";

function chartStart(today: string) {
  const date = new Date(`${today.slice(0, 7)}-01T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() - 11);
  return date.toISOString().slice(0, 10);
}

export default async function HomePage() {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santo_Domingo" }).format(new Date());
  const access = await getTenantAccess("reports.read").catch(() => ({ ok: false as const, reason: "unavailable" as const }));
  if (!access.ok) {
    if (access.reason === "forbidden") {
      const financing = await getTenantAccess("financing.read");
      if (financing.ok) redirect("/solicitudes");
      const collections = await getTenantAccess("payments.read");
      if (collections.ok) redirect("/cobros");
    }
    const state = resolveDashboardAccessState(
      Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
      access.reason,
    );
    if (state.kind === "demo") return <Dashboard data={DEFAULT_DASHBOARD_DATA} mode="demo" />;
    if (state.kind === "login") return <DashboardAccessNotice title="Inicia sesión" message="Tu sesión no está activa. Inicia sesión para consultar datos de la empresa." href="/login" linkLabel="Ir a iniciar sesión" />;
    if (state.kind === "tenant-selection") return <DashboardAccessNotice title="Selecciona una empresa" message="Tu cuenta pertenece a varias empresas. Elige la empresa activa en la barra superior para cargar sus datos." />;
    const messages: Record<Extract<DashboardAccessState, { kind: "blocked" }> ["reason"], string> = {
      "no-membership": "Tu usuario todavía no tiene una membresía activa en una empresa.",
      "tenant-suspended": "La empresa seleccionada está suspendida. No se muestran datos financieros.",
      forbidden: "Tu rol no tiene permiso para consultar el resumen financiero.",
      unavailable: "No se pudo verificar tu acceso. Intenta de nuevo cuando el servicio esté disponible.",
    };
    return <DashboardAccessNotice title="Resumen no disponible" message={messages[state.reason] ?? "No se pudo verificar el acceso a esta empresa."} />;
  }

  const db = access.supabase;
  const [summary, tenant, branch] = await Promise.all([
    db.rpc("tenant_dashboard_summary", { p_tenant_id: access.membership.tenant_id, p_from_date: chartStart(today), p_to_date: today }),
    db.from("tenants").select("name").eq("id", access.membership.tenant_id).maybeSingle(),
    access.membership.role !== "tenant_admin" && access.membership.branch_id
      ? db.from("branches").select("name").eq("id", access.membership.branch_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  const failed = [summary, tenant, branch].some((result) => result.error);
  if (failed || !isDashboardSummary(summary.data) || !tenant.data) {
    return <DashboardAccessNotice title="No se pudieron cargar los datos" message="No hay cifras verificadas para mostrar. Revisa tu conexión y permisos antes de continuar." />;
  }

  const result = summary.data;
  const number = (key: string) => Number(result[key] ?? 0);
  const upcoming = (result.upcoming ?? []) as DashboardData["upcoming"];
  const recent = (result.recent ?? []) as DashboardData["recent"];
  const chartRows = (result.chart ?? []) as { month: string; amount: number | string }[];
  const chart = chartRows.map((row) => ({
    month: new Intl.DateTimeFormat("es-DO", { month: "short", timeZone: "UTC" }).format(new Date(`${row.month}-01T12:00:00Z`)),
    amount: Number(row.amount) / 1_000_000,
  }));
  const data: DashboardData = {
    company: tenant.data?.name ?? "Empresa",
    branch: access.membership.role === "tenant_admin" ? "Todas las sucursales" : branch.data?.name ?? "Todas las sucursales",
    counts: { customers: number("customers"), devices: number("devices"), applications: number("applications"), activeLoans: number("activeLoans"), overdue: number("overdueInstallments") },
    money: { activeBalance: String(result.activeBalance ?? "0"), received: String(result.allTimePaymentsReceived ?? "0"), overdue: String(result.overdueBalance ?? "0"), collectionRate: number("collectionRate") },
    upcoming,
    recent,
    chart,
  };
  return <Dashboard data={data} mode="live" />;
}

function DashboardAccessNotice({ title, message, href, linkLabel }: { title: string; message: string; href?: string; linkLabel?: string }) {
  return <div className="min-h-screen bg-canvas"><Sidebar/><Topbar/><main id="main-content" tabIndex={-1} className="km-main px-4 pb-8 pt-10 sm:px-7 lg:ml-[244px] lg:px-7"><section role="alert" className="km-panel mx-auto max-w-2xl rounded-xl border border-warning-line bg-surface p-6 shadow-sm sm:p-8"><h1 className="text-xl font-bold text-ink">{title}</h1><p className="mt-2 text-sm leading-6 text-secondary">{message}</p>{href && <Link href={href} className="mt-5 inline-flex rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white">{linkLabel ?? "Continuar"}</Link>}</section></main></div>;
}
