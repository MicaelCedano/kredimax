import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { getTenantAccess } from "@/lib/security/tenant-access";
import { DEFAULT_FINANCING_SETTINGS } from "@/modules/financing/calculator";
import { CreditApplicationForm } from "@/modules/financing/application-form";
import { newFinancingTerms } from "@/modules/financing/term-policy";

export default async function NewCreditApplicationPage() {
  const access = await getTenantAccess("financing.write");
  if (!access.ok && access.reason === "unauthenticated") redirect("/login");
  if (!access.ok) return <div className="min-h-screen bg-canvas"><Sidebar/><Topbar/><main id="main-content" tabIndex={-1} className="km-main px-5 py-10 lg:ml-[244px]"><p role="alert" className="rounded-xl border border-warning-line bg-warning-soft p-4 text-sm text-warning">Tu usuario necesita permiso para crear solicitudes de financiamiento.</p></main></div>;

  const [settingsResult, branchesResult] = await Promise.all([
    access.supabase.from("financing_settings").select("down_payment_percent,annual_rate_percent,legal_expenses,allowed_terms,recovery_target_percent,recovery_enabled").eq("tenant_id", access.membership.tenant_id).maybeSingle(),
    access.supabase.from("branches").select("id,name").eq("tenant_id", access.membership.tenant_id).order("name"),
  ]);
  const branches = branchesResult.data ?? [];
  const defaultBranchId = access.membership.branch_id ?? (branches.length === 1 ? branches[0].id : "");
  const branchName = access.membership.branch_id ? branches.find((branch) => branch.id === access.membership.branch_id)?.name ?? "Sucursal asignada" : branches.length > 1 ? "Selecciona una sucursal" : branches[0]?.name ?? "Sin sucursal";
  const row = settingsResult.data;
  const settings = {
    downPaymentPercent: String(row?.down_payment_percent ?? DEFAULT_FINANCING_SETTINGS.downPaymentPercent),
    annualRatePercent: String(row?.annual_rate_percent ?? DEFAULT_FINANCING_SETTINGS.annualRatePercent),
    legalExpenses: String(row?.legal_expenses ?? DEFAULT_FINANCING_SETTINGS.legalExpenses),
    allowedTerms: newFinancingTerms(row?.allowed_terms ?? DEFAULT_FINANCING_SETTINGS.allowedTerms),
    recoveryTargetPercent: String(row?.recovery_target_percent ?? DEFAULT_FINANCING_SETTINGS.recoveryTargetPercent),
    recoveryEnabled: row?.recovery_enabled ?? DEFAULT_FINANCING_SETTINGS.recoveryEnabled,
  };
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santo_Domingo" }).format(new Date());

  return <div className="min-h-screen bg-canvas"><Sidebar/><Topbar/><main id="main-content" tabIndex={-1} className="km-main px-4 pb-10 pt-7 sm:px-7 lg:ml-[244px] lg:px-7">
    <Link href="/solicitudes" className="mb-4 inline-flex items-center gap-2 text-xs font-semibold text-accent"><ArrowLeft size={15}/>Volver a solicitudes</Link>
    <div className="mb-6"><p className="text-xs text-muted">{branchName}</p><h1 className="mt-1 text-[26px] font-bold tracking-[-.6px] text-ink">Nueva solicitud de financiamiento</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-muted">Completa los datos del cliente y su equipo. Revisa la cotización antes de enviarla a evaluación.</p></div>
    {(settingsResult.error || branchesResult.error) && <p role="alert" className="mb-4 rounded-lg border border-warning-line bg-warning-soft p-3 text-sm text-warning">No se pudieron cargar las sucursales o los ajustes disponibles para tu usuario.</p>}
    {!branches.length && <p role="alert" className="mb-4 rounded-lg border border-danger-line bg-danger-soft p-3 text-sm text-danger">No hay sucursales visibles para asignar esta solicitud. Asigna la membresía a una sucursal o concede acceso de administración central.</p>}
    {branches.length > 0 && <CreditApplicationForm branches={branches} defaultBranchId={defaultBranchId} settings={settings} submissionKey={crypto.randomUUID()} today={today}/>}
  </main></div>;
}
