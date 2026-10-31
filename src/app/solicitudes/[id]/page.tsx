import Link from "next/link";
import { SubmitButton } from "@/components/forms/submit-button";
import { notFound, redirect } from "next/navigation";
import { AlertTriangle, ArrowLeft, ArrowUpRight, CheckCircle2, ClipboardCheck, FileClock, ShieldCheck, Smartphone, UserRound } from "lucide-react";
import { Sidebar } from "@/components/dashboard/sidebar";
import { PreservedActionForm } from "@/components/forms/preserved-action-form";
import { Topbar } from "@/components/dashboard/topbar";
import { getTenantAccess } from "@/lib/security/tenant-access";
import { reviewCreditApplication } from "@/modules/financing/actions";
import { PendingHandover } from "@/modules/financing/pending-handover";
import { hasVariableInstallments, InstallmentSummary } from "@/modules/financing/installment-summary";
import { RecoverySummary } from "@/modules/financing/recovery-summary";
import { quoteDatesFromApproval } from "@/modules/financing/schedule-dates";
import { isoDateInTimeZone } from "@/lib/business-date";
import { compareRequestedDeviceWithCapacity, evaluateCustomerCredit, riskLabelForLevel } from "@/modules/credit-evaluation/engine";
import { loadCustomerInternalHistory, loadTenantCreditPolicy } from "@/modules/credit-evaluation/service";

import { CustomerLabel, StatusBadge } from "@/components/ui/status-badge";

const eventLabels: Record<string,string> = { created:"Solicitud creada", application_created:"Solicitud creada", reviewed:"Decisión registrada", review:"Decisión registrada", approved:"Solicitud aprobada", rejected:"Solicitud rechazada", documents_requested:"Documentación solicitada", loan_activated:"Financiamiento activado", activated:"Financiamiento activado", demo_historical_created:"Solicitud de demostración" };

const statusLabels: Record<string, string> = { pending: "Pendiente de evaluación", documents_requested: "Documentación solicitada", approved: "Aprobada", rejected: "Rechazada" };
const messages: Record<string, string> = { approved: "La solicitud se aprobó y el cronograma contractual quedó generado.", rejected: "La solicitud fue rechazada y la decisión quedó registrada.", documents_requested: "La documentación quedó solicitada y se registró en el historial.", activated: "Pago inicial, firma y entrega registrados; el préstamo quedó activo.", activada: "Pago inicial, firma y entrega registrados; el préstamo quedó activo." };

function money(value?: string) {
  if (!value) return "—";
  return new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value)).replace("DOP", "RD$");
}

export default async function CreditApplicationDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ estado?: string }> }) {
  const [{ id }, { estado }, access, reviewAccess, paymentAccess] = await Promise.all([
    params,
    searchParams,
    getTenantAccess("financing.read"),
    getTenantAccess("financing.approve"),
    getTenantAccess("payments.record"),
  ]);
  if (!access.ok && access.reason === "unauthenticated") redirect("/login");
  if (!access.ok) return <div className="min-h-screen bg-canvas"><Sidebar/><Topbar/><main id="main-content" tabIndex={-1} className="km-main px-5 py-10 lg:ml-[244px]"><p role="alert" className="rounded-xl border border-warning-line bg-warning-soft p-4 text-sm text-warning">Tu usuario no tiene permiso para consultar solicitudes.</p></main></div>;

  const { data: application, error } = await access.supabase.from("credit_applications")
    .select("id,customer_id,branch_id,status,requested_amount,quote_snapshot,review_notes,additional_charge_category,additional_charge_basis,created_at,created_by,created_by_name")
    .eq("id", id).eq("tenant_id", access.membership.tenant_id).maybeSingle();
  if (error) return <div className="min-h-screen bg-canvas"><Sidebar/><Topbar/><main id="main-content" tabIndex={-1} className="km-main px-5 py-10 lg:ml-[244px]"><p role="alert" className="rounded-xl border border-warning-line bg-warning-soft p-4 text-sm text-warning">No se pudo cargar la solicitud desde la base local.</p></main></div>;
  if (!application) notFound();
  const [{ data: events }, { data: customerProfile }, internalHistory, creditPolicy] = await Promise.all([
    access.supabase.from("credit_application_events").select("id,event_type,from_status,to_status,notes,metadata,created_at,actor_id").eq("application_id", id).eq("tenant_id", access.membership.tenant_id).order("created_at", { ascending: true }),
    access.supabase.from("customers").select("id,full_name,identity_number,phone,address,social_media,home_location,employer,occupation,employment_type,employment_tenure_months,monthly_income,verified_monthly_income,other_verifiable_income,essential_monthly_expenses,existing_monthly_debts,verified_monthly_debts,dependents_count,housing_type,monthly_rent_expense,reference_name,reference_phone,reference_relationship,reference_identity_number,work_reference_name,work_reference_phone,income_verification_status,identity_verification_status,employment_verification_status,financial_data_consent").eq("id", application.customer_id).eq("tenant_id", access.membership.tenant_id).maybeSingle(),
    loadCustomerInternalHistory(access.supabase, access.membership.tenant_id, application.customer_id),
    loadTenantCreditPolicy(access.supabase, access.membership.tenant_id),
  ]);
  const approvedEvent = [...(events ?? [])].reverse().find((event) => event.to_status === "approved" && typeof (event.metadata as Record<string, unknown> | null)?.loanId === "string");
  const loanId = approvedEvent ? String((approvedEvent.metadata as Record<string, unknown>).loanId) : null;
  const { data: loan } = loanId ? await access.supabase.from("loans")
    .select("id,branch_id,status,down_payment,contract_id,delivered_at,delivered_by,activated_at,activated_by")
    .eq("id", loanId).eq("tenant_id", access.membership.tenant_id).maybeSingle() : { data: null };
  const { data: contract } = loan?.contract_id ? await access.supabase.from("credit_contracts")
    .select("terms").eq("id", loan.contract_id).eq("tenant_id", access.membership.tenant_id).maybeSingle() : { data: null };
  const savedQuote = (contract?.terms ?? application.quote_snapshot) as {
    applicant?: { customerName?: string; identityNumber?: string | null; phone?: string | null; address?: string | null; employer?: string | null; monthlyIncome?: string | null; reference?: { name: string; phone: string; relationship?: string | null; identityNumber?: string | null } | null };
    device?: { brand?: string; model?: string; imei?: string | null; serialNumber?: string | null; condition?: string; inventoryBranch?: string };
    salePrice?: string; deviceCost?: string; downPaymentPercent?: string; annualRatePercent?: string; downPayment?: string; principal?: string; baseInterest?: string; legalExpenses?: string;
    fixedInstallment?: string; baseInstallment?: string; recoveryInstallment?: string; proposedAdjustment?: string; totalCustomerPays?: string;
    recoveryAtHalf?: string; recoveryAtSixMonths?: string; paymentDistribution?: string; recoveryTarget?: string; recoveryDifference?: string; recoveryMet?: boolean; recoveryEnabled?: boolean; termMonths?: number; frequency?: string;
    installmentCount?: number; firstInstallmentDate?: string; finalDueDate?: string; adjustmentRequiresApproval?: boolean; installmentRounding?: string; roundingAdjustment?: string;
    schedule?: { sequence: number; dueDate: string; amount: string; principal: string; interest: string; legalExpenses: string; proposedAdjustment: string }[];
  };
  const isSchedulePreview = ["pending", "documents_requested"].includes(application.status);
  const quote = isSchedulePreview && savedQuote.schedule?.length && (savedQuote.frequency === "monthly" || savedQuote.frequency === "fortnightly")
    ? { ...savedQuote, ...quoteDatesFromApproval({ frequency: savedQuote.frequency, firstInstallmentDate: savedQuote.firstInstallmentDate ?? "", finalDueDate: savedQuote.finalDueDate ?? "", schedule: savedQuote.schedule }, isoDateInTimeZone(new Date())) }
    : savedQuote;
  const adjustmentRequired = quote.adjustmentRequiresApproval ?? Number(quote.proposedAdjustment ?? 0) > 0;
  const canReview = reviewAccess.ok && (reviewAccess.membership.role === "tenant_admin" || !reviewAccess.membership.branch_id || reviewAccess.membership.branch_id === application.branch_id) && ["pending", "documents_requested"].includes(application.status);

  const employer = quote.applicant?.employer || customerProfile?.employer || "No registrado";
  const monthlyIncomeRaw = quote.applicant?.monthlyIncome || (customerProfile?.monthly_income !== null && customerProfile?.monthly_income !== undefined ? String(customerProfile.monthly_income) : null);
  const monthlyIncomeText = monthlyIncomeRaw ? money(monthlyIncomeRaw) : "No registrado";
  const refName = quote.applicant?.reference?.name || customerProfile?.reference_name || null;
  const refPhone = quote.applicant?.reference?.phone || customerProfile?.reference_phone || null;
  const refIdentityNumber = quote.applicant?.reference?.identityNumber || customerProfile?.reference_identity_number || null;
  const referenceText = refName || refPhone || refIdentityNumber ? [quote.applicant?.reference?.relationship || customerProfile?.reference_relationship, refName, refPhone, refIdentityNumber ? `Cédula: ${refIdentityNumber}` : null].filter(Boolean).join(" · ") : "No registrada";

  const evaluation = customerProfile
    ? evaluateCustomerCredit(
        {
          identityNumber: customerProfile.identity_number,
          phone: customerProfile.phone,
          address: customerProfile.address,
          occupation: customerProfile.occupation,
          employmentType: customerProfile.employment_type,
          employer: customerProfile.employer || quote.applicant?.employer || null,
          employmentTenureMonths: customerProfile.employment_tenure_months,
          declaredMonthlyIncome: customerProfile.monthly_income ?? quote.applicant?.monthlyIncome ?? null,
          verifiedMonthlyIncome: customerProfile.verified_monthly_income,
          otherVerifiableIncome: customerProfile.other_verifiable_income,
          essentialMonthlyExpenses: customerProfile.essential_monthly_expenses,
          existingMonthlyDebts: customerProfile.existing_monthly_debts,
          verifiedMonthlyDebts: customerProfile.verified_monthly_debts,
          dependentsCount: customerProfile.dependents_count,
          housingType: customerProfile.housing_type,
          monthlyRentExpense: customerProfile.monthly_rent_expense,
          referenceName: customerProfile.reference_name || quote.applicant?.reference?.name || null,
          referencePhone: customerProfile.reference_phone || quote.applicant?.reference?.phone || null,
          workReferenceName: customerProfile.work_reference_name,
          workReferencePhone: customerProfile.work_reference_phone,
          incomeVerificationStatus: customerProfile.income_verification_status,
          identityVerificationStatus: customerProfile.identity_verification_status,
          employmentVerificationStatus: customerProfile.employment_verification_status,
          financialDataConsent: customerProfile.financial_data_consent,
        },
        internalHistory,
        creditPolicy,
      )
    : null;
  const capacityComparison = evaluation && quote.salePrice && quote.fixedInstallment
    ? compareRequestedDeviceWithCapacity({
        evaluation,
        requestedSalePrice: quote.salePrice,
        fixedInstallment: quote.fixedInstallment,
        frequency: quote.frequency === "fortnightly" ? "fortnightly" : "monthly",
        policy: creditPolicy,
      })
    : null;

  return <div className="min-h-screen bg-canvas"><Sidebar/><Topbar/><main id="main-content" tabIndex={-1} className="km-main px-4 pb-10 pt-7 sm:px-7 lg:ml-[244px] lg:px-7">
    <Link href="/solicitudes" className="mb-4 inline-flex items-center gap-2 text-xs font-semibold text-accent"><ArrowLeft size={15}/>Volver a solicitudes</Link>
    {estado && messages[estado] && <p role="status" className="mb-4 rounded-lg border border-positive-line bg-positive-soft px-4 py-3 text-sm text-positive">{messages[estado]}</p>}
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3"><div><h1 className="km-page-title">{quote.applicant?.customerName ?? "Cliente"}</h1><p className="mt-1 text-sm text-muted">Solicitud {application.id.slice(0, 8).toUpperCase()} · Creada {new Intl.DateTimeFormat("es-DO", { dateStyle: "long", timeZone: "America/Santo_Domingo" }).format(new Date(application.created_at))}</p></div><StatusBadge status={application.status} label={statusLabels[application.status] ?? application.status}/></div>
    <p className="mb-6 text-sm text-muted">Vendedor que registró la solicitud: <span className="font-semibold text-secondary">{application.created_by_name ?? "Usuario registrado"}</span></p>
    {application.status === "approved" && loan?.status === "approved" && <PendingHandover applicationId={application.id} profile={customerProfile}/>}
    <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-5">
        <section className="km-panel overflow-hidden"><div className="grid divide-y divide-line md:grid-cols-2 md:divide-x md:divide-y-0"><div className="min-w-0 p-5 sm:p-6"><div className="mb-5 flex items-center justify-between gap-2"><h2 className="flex items-center gap-2 text-base font-bold"><UserRound size={18} className="text-accent" aria-hidden/>Cliente</h2><Link href={`/clientes/${application.customer_id}`} className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline">Ver ficha<ArrowUpRight size={13} aria-hidden/></Link></div><CustomerLabel name={quote.applicant?.customerName ?? "Cliente"}/><dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">{[["Documento",quote.applicant?.identityNumber || customerProfile?.identity_number || "No registrado"],["Teléfono",quote.applicant?.phone || customerProfile?.phone || "No registrado"],["Redes sociales",customerProfile?.social_media || "No registradas"],["Dirección",quote.applicant?.address || customerProfile?.address || "No registrada"],["Ubicación de la casa",customerProfile?.home_location || "No registrada"],["Empleo / empresa",employer],["Ingreso mensual",monthlyIncomeText],["Referencia personal",referenceText]].map(([label,value])=><div key={label} className={label === "Dirección" || label === "Ubicación de la casa" || label === "Referencia personal" ? "sm:col-span-2" : ""}><dt className="text-xs text-muted">{label}</dt><dd className="mt-1 break-words text-secondary">{value}</dd></div>)}</dl></div><div className="min-w-0 p-5 sm:p-6"><h2 className="mb-5 flex items-center gap-2 text-base font-bold"><Smartphone size={18} className="text-accent" aria-hidden/>Equipo</h2><p className="text-xs text-muted">{quote.device?.brand}</p><h3 className="mt-1 break-words text-lg font-semibold">{quote.device?.model ?? "Sin modelo"}</h3><span className="mt-2 inline-flex rounded-md bg-soft px-2.5 py-1 text-xs text-secondary">{quote.device?.condition === "used" ? "Usado" : "Nuevo"}</span><dl className="mt-5 space-y-4 text-sm"><div><dt className="text-xs text-muted">IMEI</dt><dd className="mt-1 select-all break-all font-mono text-secondary">{quote.device?.imei ?? "No registrado"}</dd></div><div><dt className="text-xs text-muted">Sucursal de origen</dt><dd className="mt-1 text-secondary">{quote.device?.inventoryBranch ?? "No registrada"}</dd></div><div><dt className="text-xs text-muted">Precio de venta</dt><dd className="km-amount mt-1 text-xl font-bold text-ink">{money(quote.salePrice)}</dd></div></dl></div></div></section>

        {evaluation && (
          <section className="km-panel p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldCheck size={18} className="text-accent" />
                <h2 className="text-sm font-bold text-ink">Evaluación crediticia interna y capacidad</h2>
              </div>
              <Link href={`/clientes/${application.customer_id}`} className="text-xs font-semibold text-accent hover:underline">
                Abrir perfil crediticio completo →
              </Link>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-line bg-subtle/70 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[.08em] text-muted">Score interno</p>
                <p className="mt-1 text-lg font-extrabold text-ink">
                  {evaluation.totalScore !== null ? `${evaluation.totalScore}/100` : "Sin calificar"}
                </p>
                <p className="text-[11px] font-semibold text-secondary">{riskLabelForLevel(evaluation.riskLevel)}</p>
              </div>
              <div className="rounded-lg border border-line bg-subtle/70 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[.08em] text-muted">Capacidad mensual</p>
                <p className="km-amount mt-1 text-lg font-extrabold text-ink">{money(evaluation.monthlyPaymentCapacity)}</p>
                <p className="text-[11px] text-muted">Cuota equiv. sol.: {money(capacityComparison?.monthlyEquivalentInstallment)}</p>
              </div>
              <div className="rounded-lg border border-line bg-subtle/70 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[.08em] text-muted">Precio máx. sugerido</p>
                <p className="km-amount mt-1 text-lg font-extrabold text-accent">{money(evaluation.recommendedMaxSalePrice)}</p>
                <p className="text-[11px] text-muted">Solicitado: {money(quote.salePrice)}</p>
              </div>
              <div className="rounded-lg border border-line bg-subtle/70 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[.08em] text-muted">Impacto en capacidad</p>
                <p className="mt-1 text-lg font-extrabold text-ink">{capacityComparison?.capacityUtilizationPercent ?? 0}%</p>
                <p className="text-[11px] text-muted">Mora activa: {internalHistory.overdueInstallmentsCount} cuotas</p>
              </div>
            </div>
            {capacityComparison?.requiresManualReview ? (
              <div className="mt-4 rounded-xl border border-warning-line bg-warning-soft p-3.5 text-xs text-warning">
                <div className="flex items-center gap-1.5 font-bold">
                  <AlertTriangle size={14} className="text-warning" />
                  Alerta de capacidad / riesgo — Requiere revisión manual justificada
                </div>
                <ul className="mt-1.5 space-y-1">
                  {capacityComparison.alerts.map((reason: string) => (
                    <li key={reason}>• {reason}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="mt-4 flex items-center gap-2 rounded-xl border border-positive-line bg-positive-soft p-3 text-xs font-medium text-positive">
                <CheckCircle2 size={15} className="text-positive" />
                El precio del equipo ({money(quote.salePrice)}) y la cuota solicitada se encuentran dentro del límite orientativo del cliente.
              </div>
            )}
          </section>
        )}

        <section className="km-panel p-5 sm:p-6"><h2 className="text-sm font-bold text-ink">Cronograma de cuotas</h2><p className="mt-1 text-[11px] text-muted">Condiciones guardadas · {quote.termMonths} meses · {quote.frequency === "fortnightly" ? "Quincenal" : "Mensual"}</p><div className="mt-5 divide-y divide-line md:hidden">{(quote.schedule ?? []).map(row=><details key={row.sequence} className="py-4"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm"><span><b className="block">Cuota {row.sequence}</b><span className="mt-1 block text-xs text-muted">{new Intl.DateTimeFormat("es-DO", { dateStyle:"medium",timeZone:"UTC" }).format(new Date(`${row.dueDate}T12:00:00Z`))}</span></span><span className="km-amount font-bold text-accent">{money(row.amount)}<span className="mt-1 block text-right text-[11px] font-normal">Ver detalle</span></span></summary><dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-subtle p-3 text-xs">{[["Capital",row.principal],["Interés",row.interest],["Gastos",row.legalExpenses],["Ajuste",row.proposedAdjustment]].map(([label,value])=><div key={label}><dt className="text-muted">{label}</dt><dd className="km-amount mt-1 font-semibold">{money(value)}</dd></div>)}</dl></details>)}</div><div className="mt-5 hidden overflow-x-auto md:block"><table className="km-table min-w-[720px]"><thead className="bg-subtle text-muted"><tr><th className="px-3 py-2.5">N.º</th><th className="px-3 py-2.5">Vencimiento</th><th className="px-3 py-2.5 text-right">Cuota</th><th className="px-3 py-2.5 text-right">Capital</th><th className="px-3 py-2.5 text-right">Interés</th><th className="px-3 py-2.5 text-right">Gastos</th><th className="px-3 py-2.5 text-right">Ajuste prop.</th></tr></thead><tbody>{(quote.schedule ?? []).map((row) => <tr key={row.sequence} className="border-t border-line"><td className="px-3 py-2.5">{row.sequence}</td><td className="px-3 py-2.5">{new Intl.DateTimeFormat("es-DO", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${row.dueDate}T00:00:00.000Z`))}</td><td className="px-3 py-2.5 text-right font-semibold">{money(row.amount)}</td><td className="px-3 py-2.5 text-right">{money(row.principal)}</td><td className="px-3 py-2.5 text-right">{money(row.interest)}</td><td className="px-3 py-2.5 text-right">{money(row.legalExpenses)}</td><td className="px-3 py-2.5 text-right">{money(row.proposedAdjustment)}</td></tr>)}</tbody></table></div></section>
        <section className="km-panel p-5 sm:p-6"><div className="mb-4 flex items-center gap-2"><FileClock size={17} className="text-accent"/><h2 className="text-sm font-bold text-ink">Historial de evaluación</h2></div>{events?.length ? <ol className="ml-2 border-l border-line">{events.map((event) => <li key={event.id} className="relative pb-7 pl-7 last:pb-0"><span aria-hidden className={`absolute -left-[7px] top-1 h-3.5 w-3.5 rounded-full border-[3px] border-white ring-1 ${event.to_status === "rejected" ? "bg-danger-soft0 ring-danger-line" : event.to_status === "approved" ? "bg-positive-soft0 ring-positive-line" : "bg-accent-soft0 ring-blue-200"}`}/><p className="text-sm font-semibold text-ink">{eventLabels[event.event_type] ?? "Actualización de solicitud"}</p><p className="mt-1 text-xs text-muted">{new Intl.DateTimeFormat("es-DO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Santo_Domingo" }).format(new Date(event.created_at))}</p>{event.from_status && <p className="mt-1 text-[11px] text-muted">{statusLabels[event.from_status] ?? event.from_status} → {statusLabels[event.to_status ?? ""] ?? event.to_status}</p>}{event.notes && <p className="mt-1 whitespace-pre-wrap text-xs text-secondary">{event.notes}</p>}{event.metadata && typeof event.metadata === "object" && "additionalChargeCategory" in event.metadata && Boolean(event.metadata.additionalChargeCategory) && <p className="mt-1 text-[11px] text-muted">Categoría adicional: {String(event.metadata.additionalChargeCategory)}</p>}</li>)}</ol> : <p className="text-xs text-muted">Sin movimientos registrados.</p>}</section>
      </div>
      <aside className="min-w-0 space-y-4 xl:sticky xl:top-[86px]"><section className="km-panel overflow-hidden"><div className="bg-[#09203d] p-5 text-white"><p className="text-[11px] font-semibold uppercase tracking-[.14em] text-blue-200">{hasVariableInstallments(quote.schedule) ? "Cuota inicial por tramos" : adjustmentRequired ? "Cuota fija propuesta" : "Cuota fija"}</p><p className="mt-2 text-2xl font-bold">{money(quote.fixedInstallment)}</p><p className="mt-1 text-xs text-blue-100">{quote.installmentCount} cuotas · {quote.frequency === "fortnightly" ? "Quincenal" : "Mensual"}</p></div><div className="space-y-3 p-5 text-xs"><InstallmentSummary schedule={quote.schedule} frequency={quote.frequency} paymentDistribution={quote.paymentDistribution}/><div className="flex justify-between"><span className="text-muted">Inicial ({quote.downPaymentPercent}%)</span><b>{money(quote.downPayment)}</b></div><div className="flex justify-between"><span className="text-muted">Capital financiado</span><b>{money(quote.principal)}</b></div><div className="flex justify-between"><span className="text-muted">Interés simple ({quote.annualRatePercent}%)</span><b>{money(quote.baseInterest)}</b></div><div className="flex justify-between"><span className="text-muted">Gastos legales</span><b>{money(quote.legalExpenses)}</b></div>{quote.installmentRounding === "up_50" && <div className="flex justify-between"><span className="text-muted">Ajuste por redondeo de cuotas</span><b>{money(quote.proposedAdjustment)}</b></div>}<div className="flex justify-between border-t border-line pt-3"><span className="font-semibold">Total estimado al cliente</span><b>{money(quote.totalCustomerPays)}</b></div><RecoverySummary quote={quote}/>{adjustmentRequired && <p className="rounded-lg border border-warning-line bg-warning-soft p-3 text-[11px] leading-5 text-warning">Ajuste propuesto {money(quote.proposedAdjustment)}: separado de interés y gastos; requiere categoría comercial, soporte contractual y aprobación expresa antes del contrato.</p>}<p className="text-[11px] text-muted">{isSchedulePreview && "Estimación si se aprueba hoy. Fechas definitivas al aprobar. "}{application.status === "approved" && !contract && "No se pudo cargar el contrato; se muestra la cotización original. "}Primera cuota: {quote.firstInstallmentDate} · Vencimiento final: {quote.finalDueDate}</p></div></section>
        {application.review_notes && <section className="km-panel rounded-xl border border-line bg-surface p-4"><h2 className="text-xs font-bold text-ink">Nota de revisión</h2><p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-secondary">{application.review_notes}</p>{application.additional_charge_category && <p className="mt-2 text-[11px] text-muted">Cargo adicional aprobado: {application.additional_charge_category}{application.additional_charge_basis ? ` · ${application.additional_charge_basis}` : ""}</p>}</section>}
        {canReview ? <section className="km-panel p-5 sm:p-6"><h2 className="flex items-center gap-2 text-base font-bold"><ClipboardCheck size={18} className="text-accent" aria-hidden/>Decisión de evaluación</h2><p className="mt-1 text-[11px] leading-5 text-muted">La puntuación automática es una recomendación interna. La decisión final corresponde al personal autorizado y debe quedar justificada.</p><PreservedActionForm action={reviewCreditApplication} className="mt-4 space-y-3" messages={{"review-invalid":"Revisa los datos de la decisión.","review-note-required":"Escribe un motivo para rechazar o solicitar documentos.","additional-charge-approval-required":"Completa la aprobación y soporte del cargo adicional.","recovery-review-required":"La solicitud no cumple el criterio de recuperación configurado.","device-not-in-inventory":"El dispositivo debe estar en inventario antes de aprobar.","not-found":"La solicitud ya no está disponible.",forbidden:"No tienes permiso para evaluar esta solicitud.","review-error":"No se pudo registrar la decisión; tus datos se conservaron."}}><input type="hidden" name="applicationId" value={application.id}/><label className="block text-xs font-semibold text-secondary">Decisión<select name="decision" required defaultValue="" className="km-input mt-1.5 w-full rounded-lg border border-field-border bg-surface px-3 py-2.5 text-sm font-normal"><option value="" disabled>Selecciona una decisión</option><option value="approved">Aprobar</option><option value="documents_requested">Solicitar documentación</option><option value="rejected">Rechazar</option></select></label><label className="block text-xs font-semibold text-secondary">Nota / justificación de la decisión<textarea name="notes" maxLength={2000} rows={3} className="km-input mt-1.5 w-full rounded-lg border border-field-border px-3 py-2.5 text-sm font-normal" placeholder="Registra las razones de aprobación, excepción o rechazo"/></label>{adjustmentRequired && <div className="space-y-3 rounded-lg border border-warning-line bg-warning-soft p-3"><p className="text-[11px] leading-5 text-warning">Para aprobar este ajuste, confirma una categoría comercial y su soporte contractual. La aplicación solo conserva tu decisión; no verifica la validez legal externa.</p><label className="block text-xs font-semibold text-secondary">Categoría comercial *<input name="additionalChargeCategory" maxLength={100} className="km-input mt-1.5 w-full rounded-lg border border-warning-line bg-surface px-3 py-2.5 text-sm font-normal" placeholder="Categoría previamente aprobada"/></label><label className="block text-xs font-semibold text-secondary">Base contractual / referencia de aprobación *<textarea name="additionalChargeBasis" maxLength={1000} rows={2} className="km-input mt-1.5 w-full rounded-lg border border-warning-line bg-surface px-3 py-2.5 text-sm font-normal"/></label><label className="flex items-start gap-2 text-[11px] leading-5 text-warning"><input type="checkbox" name="additionalChargeAttested" className="mt-1 accent-amber-700"/><span>Confirmo que verifiqué la aprobación comercial y el soporte contractual aplicable.</span></label></div>}<SubmitButton className="km-primary inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">Registrar decisión</SubmitButton></PreservedActionForm></section> : null}
        {application.status === "approved" && <section className={`rounded-xl border p-4 text-xs leading-5 ${loan?.status === "active" ? "border-positive-line bg-positive-soft text-positive" : "border-line bg-surface text-secondary"}`}>
          <h2 className="font-bold">{loan?.status === "active" ? "Préstamo activo" : "Formalización y activación"}</h2>
          {loan?.status === "active" ? <p className="mt-2">Inicial registrado · Entrega {loan.delivered_at ?? "—"} · Responsable: usuario {loan.delivered_by ?? "—"}</p>
            : loan?.status === "approved" && reviewAccess.ok && paymentAccess.ok && (reviewAccess.membership.role === "tenant_admin" || !reviewAccess.membership.branch_id || reviewAccess.membership.branch_id === application.branch_id) && (paymentAccess.membership.role === "tenant_admin" || !paymentAccess.membership.branch_id || paymentAccess.membership.branch_id === loan.branch_id)
              ? <Link href={`/solicitudes/${application.id}/entrega`} className="km-primary mt-4 w-full">Preparar entrega del equipo</Link>
              : <p className="mt-2">El préstamo aprobado requiere pago del inicial, contrato firmado documentado y entrega con fecha y responsable antes de aceptar cobros ordinarios.{!loan && " No se pudo leer el préstamo; verifica el alcance de tu sucursal."}</p>}
        </section>}
      </aside>
    </div>
  </main></div>;
}
