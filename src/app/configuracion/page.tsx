import Link from "next/link";
import { PanelHeading } from "@/components/ui/panel-heading";
import { MoneyInput } from "@/components/forms/money-input";
import { SubmitButton } from "@/components/forms/submit-button";
import { redirect } from "next/navigation";
import { ArrowLeft, Settings2, ShieldCheck } from "lucide-react";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { AppearanceControl } from "@/components/ui/appearance-control";
import { PreservedActionForm } from "@/components/forms/preserved-action-form";
import { getTenantAccess } from "@/lib/security/tenant-access";
import { DEFAULT_FINANCING_SETTINGS } from "@/modules/financing/calculator";
import { saveFinancingSettings } from "@/modules/financing/actions";
import { resolveCreditPolicy } from "@/modules/credit-evaluation/engine";
import { saveCreditPolicySettings } from "@/modules/credit-evaluation/actions";

const terms = DEFAULT_FINANCING_SETTINGS.allowedTerms;

export default async function FinancingSettingsPage({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const [{ estado }, access] = await Promise.all([searchParams, getTenantAccess("settings.manage")]);
  if (!access.ok && access.reason === "unauthenticated") redirect("/login");
  if (!access.ok) return <div className="min-h-screen bg-canvas"><Sidebar/><Topbar/><main id="main-content" tabIndex={-1} className="km-main px-5 py-10 lg:ml-[244px]"><p role="alert" className="rounded-xl border border-warning-line bg-warning-soft p-4 text-sm text-warning">Solo un administrador puede cambiar los valores predeterminados del financiamiento.</p><Link href="/" className="mt-4 inline-flex text-sm font-semibold text-accent">Volver al dashboard</Link></main></div>;
  const { data, error } = await access.supabase
    .from("financing_settings")
    .select("down_payment_percent,annual_rate_percent,legal_expenses,allowed_terms,recovery_enabled,credit_policy")
    .eq("tenant_id", access.membership.tenant_id)
    .maybeSingle();
  const allowedTerms = data?.allowed_terms ?? [...DEFAULT_FINANCING_SETTINGS.allowedTerms];
  const creditPolicy = resolveCreditPolicy(data?.credit_policy as Record<string, unknown> | null);

  return <div className="min-h-screen bg-canvas"><Sidebar/><Topbar/><main id="main-content" tabIndex={-1} className="km-main px-4 pb-10 pt-7 sm:px-7 lg:ml-[244px] lg:px-7">
    <Link href="/" className="mb-4 inline-flex items-center gap-2 text-xs font-semibold text-accent"><ArrowLeft size={15}/>Volver al dashboard</Link>
    <div className="mb-6"><p className="text-xs font-semibold uppercase tracking-[.14em] text-accent">Administración · KrediMax</p><h1 className="mt-1 text-[26px] font-bold tracking-[-.6px] text-ink">Configuración financiera y políticas crediticias</h1><p className="mt-1 text-sm text-muted">Todos los cambios realizados por administradores quedan registrados en el historial de auditoría.</p></div>
    <section className="km-panel mb-6 flex max-w-6xl flex-wrap items-center justify-between gap-4 p-5"><div><h2 className="text-base font-semibold text-ink">Apariencia</h2><p className="mt-1 text-sm text-muted">Elige cómo se ve KrediMax en este dispositivo.</p></div><AppearanceControl expanded/></section>
    {estado === "guardada" && <p role="status" className="mb-4 rounded-lg border border-positive-line bg-positive-soft px-4 py-3 text-sm text-positive">Los valores predeterminados de financiamiento quedaron guardados y auditados.</p>}
    {estado === "politica-guardada" && <p role="status" className="mb-4 rounded-lg border border-positive-line bg-positive-soft px-4 py-3 text-sm text-positive">Las políticas de evaluación crediticia interna quedaron guardadas y auditadas.</p>}
    {estado && estado !== "guardada" && estado !== "politica-guardada" && <p role="alert" className="mb-4 rounded-lg border border-danger-line bg-danger-soft px-4 py-3 text-sm text-danger">No se pudieron guardar los valores; revisa las ponderaciones (deben sumar 100), los umbrales y los porcentajes.</p>}
    {error ? <p role="alert" className="rounded-xl border border-warning-line bg-warning-soft p-4 text-sm text-warning">No se pudo leer la configuración local.</p> : (
      <div className="grid max-w-6xl gap-6 xl:grid-cols-2">
        <section className="km-panel rounded-xl border border-line bg-surface p-5 sm:p-7">
          <PanelHeading title="Parámetros estándar de financiamiento" description="Inicial mínima, interés anual simple, gastos legales y plazos permitidos (DOP)." icon={Settings2} inset="settings"/>
          <PreservedActionForm action={saveFinancingSettings} className="space-y-5" messages={{
            "settings-invalid": "Revisa porcentajes, montos y plazos. Tus valores siguen en el formulario.",
            "settings-save-error": "No se pudieron guardar los valores. Tus datos siguen en el formulario; vuelve a intentar.",
            forbidden: "Tu rol no puede cambiar estos valores.",
            unavailable: "No se pudo verificar tu acceso. Vuelve a intentar.",
          }}>
            <div className="grid gap-4 sm:grid-cols-3"><label className="block text-xs font-semibold text-secondary">Inicial estándar (%)<input required type="number" name="downPaymentPercent" min="0.01" max="100" step="0.01" defaultValue={data?.down_payment_percent ?? DEFAULT_FINANCING_SETTINGS.downPaymentPercent} className="km-input mt-1.5 w-full rounded-lg border border-field-border px-3 py-2.5 text-sm font-normal"/></label><label className="block text-xs font-semibold text-secondary">Tasa anual simple (%)<input required type="number" name="annualRatePercent" min="0" max="100" step="0.01" defaultValue={Number(data?.annual_rate_percent ?? DEFAULT_FINANCING_SETTINGS.annualRatePercent).toFixed(2)} className="km-input mt-1.5 w-full rounded-lg border border-field-border px-3 py-2.5 text-sm font-normal"/></label><label className="block text-xs font-semibold text-secondary">Gastos legales (RD$)<MoneyInput required type="number" name="legalExpenses" min="0" step="0.01" defaultValue={data?.legal_expenses ?? DEFAULT_FINANCING_SETTINGS.legalExpenses} className="km-input mt-1.5 w-full rounded-lg border border-field-border px-3 py-2.5 text-sm font-normal"/></label></div>
            <fieldset><legend className="text-xs font-semibold text-secondary">Plazos disponibles</legend><div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">{terms.map((term) => <label key={term} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2.5 text-xs text-secondary"><input type="checkbox" name="allowedTerms" value={term} defaultChecked={allowedTerms.includes(term)} className="accent-blue-700"/>{term} meses</label>)}</div></fieldset>
            <label className="flex items-start gap-3 rounded-lg border border-accent-line bg-accent-soft p-3 text-xs leading-5 text-accent"><input type="checkbox" name="recoveryEnabled" value="on" defaultChecked={data?.recovery_enabled ?? DEFAULT_FINANCING_SETTINGS.recoveryEnabled} className="mt-0.5 accent-blue-700"/><span><b>Adelantar la recuperación con una diferencia máxima del 20%.</b><br/>Redistribuye el mismo total entre las primeras y las últimas cuotas, manteniéndolas en múltiplos de RD$50. La recuperación del 100% no es obligatoria. Al desactivarla, las cuotas quedan parejas.</span></label>
            <SubmitButton className="km-primary inline-flex items-center justify-center rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">Guardar valores de financiamiento</SubmitButton>
          </PreservedActionForm>
        </section>

        <section className="km-panel rounded-xl border border-line bg-surface p-5 sm:p-7">
          <PanelHeading title="Políticas de evaluación crediticia interna" description="Ponderaciones del score (0–100), umbrales de riesgo y reglas de capacidad mensual." icon={ShieldCheck} inset="settings"/>
          <PreservedActionForm action={saveCreditPolicySettings} className="space-y-5" messages={{
            "policy-invalid": "Revisa las ponderaciones (deben sumar 100), los umbrales de riesgo y los porcentajes ingresados.",
            "policy-save-error": "No se pudo guardar la política crediticia; intenta nuevamente.",
            forbidden: "Solo un administrador puede modificar las políticas crediticias.",
          }}>
            <fieldset className="rounded-lg border border-line bg-subtle/60 p-3.5">
              <legend className="px-1 text-xs font-bold text-ink">Ponderaciones del score interno (Total = 100 pts)</legend>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-semibold text-secondary">Capacidad de pago comprobada<input required type="number" name="weightPaymentCapacity" min="0" max="100" step="1" defaultValue={creditPolicy.weights.paymentCapacity} className="km-input mt-1 w-full rounded-lg border border-field-border bg-surface px-3 py-2 text-sm font-normal"/></label>
                <label className="block text-xs font-semibold text-secondary">Historial de pagos en KrediMax<input required type="number" name="weightPaymentHistory" min="0" max="100" step="1" defaultValue={creditPolicy.weights.paymentHistory} className="km-input mt-1 w-full rounded-lg border border-field-border bg-surface px-3 py-2 text-sm font-normal"/></label>
                <label className="block text-xs font-semibold text-secondary">Estabilidad de ingresos<input required type="number" name="weightIncomeStability" min="0" max="100" step="1" defaultValue={creditPolicy.weights.incomeStability} className="km-input mt-1 w-full rounded-lg border border-field-border bg-surface px-3 py-2 text-sm font-normal"/></label>
                <label className="block text-xs font-semibold text-secondary">Endeudamiento actual<input required type="number" name="weightCurrentIndebtedness" min="0" max="100" step="1" defaultValue={creditPolicy.weights.currentIndebtedness} className="km-input mt-1 w-full rounded-lg border border-field-border bg-surface px-3 py-2 text-sm font-normal"/></label>
                <label className="block text-xs font-semibold text-secondary sm:col-span-2">Verificación de identidad y documentación<input required type="number" name="weightIdentityVerification" min="0" max="100" step="1" defaultValue={creditPolicy.weights.identityVerification} className="km-input mt-1 w-full rounded-lg border border-field-border bg-surface px-3 py-2 text-sm font-normal"/></label>
              </div>
            </fieldset>

            <fieldset className="rounded-lg border border-line bg-subtle/60 p-3.5">
              <legend className="px-1 text-xs font-bold text-ink">Umbrales de clasificación de riesgo (0–100)</legend>
              <div className="mt-2 grid gap-3 sm:grid-cols-3">
                <label className="block text-xs font-semibold text-secondary">Riesgo bajo (mín.)<input required type="number" name="lowRiskMin" min="50" max="100" step="1" defaultValue={creditPolicy.thresholds.lowRiskMin} className="km-input mt-1 w-full rounded-lg border border-field-border bg-surface px-3 py-2 text-sm font-normal"/></label>
                <label className="block text-xs font-semibold text-secondary">Moderado-bajo (mín.)<input required type="number" name="moderateLowRiskMin" min="30" max="95" step="1" defaultValue={creditPolicy.thresholds.moderateLowRiskMin} className="km-input mt-1 w-full rounded-lg border border-field-border bg-surface px-3 py-2 text-sm font-normal"/></label>
                <label className="block text-xs font-semibold text-secondary">Requiere revisión (mín.)<input required type="number" name="reviewRequiredMin" min="10" max="85" step="1" defaultValue={creditPolicy.thresholds.reviewRequiredMin} className="km-input mt-1 w-full rounded-lg border border-field-border bg-surface px-3 py-2 text-sm font-normal"/></label>
              </div>
            </fieldset>

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block text-xs font-semibold text-secondary">Límite endeudamiento (%)<input required type="number" name="maxDebtToIncomePercent" min="10" max="80" step="0.01" defaultValue={creditPolicy.maxDebtToIncomePercent} className="km-input mt-1 w-full rounded-lg border border-field-border px-3 py-2 text-sm font-normal"/></label>
              <label className="block text-xs font-semibold text-secondary">Plazo base evaluación<select name="defaultEvaluationTermMonths" defaultValue={String(creditPolicy.defaultEvaluationTermMonths)} className="km-input mt-1 w-full rounded-lg border border-field-border bg-surface px-3 py-2 text-sm font-normal">{terms.map((t) => <option key={t} value={t}>{t} meses</option>)}</select></label>
              <label className="block text-xs font-semibold text-secondary">Vigencia evaluación (días)<input required type="number" name="evaluationValidityDays" min="1" max="365" step="1" defaultValue={creditPolicy.evaluationValidityDays} className="km-input mt-1 w-full rounded-lg border border-field-border px-3 py-2 text-sm font-normal"/></label>
            </div>

            <div className="space-y-2 rounded-lg border border-line p-3 text-xs text-secondary">
              <p className="font-bold text-ink">Reglas para revisión manual obligatoria</p>
              <label className="flex items-center gap-2"><input type="checkbox" name="requireManualReviewOverLimit" value="on" defaultChecked={creditPolicy.requireManualReviewOverLimit} className="accent-blue-700"/>Alertar y exigir revisión manual cuando la solicitud supere el límite recomendado</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="requireManualReviewForHighRisk" value="on" defaultChecked={creditPolicy.requireManualReviewForHighRisk} className="accent-blue-700"/>Exigir revisión manual justificada cuando el cliente tenga nivel de riesgo alto</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="requireManualReviewForUnverifiedIncome" value="on" defaultChecked={creditPolicy.requireManualReviewForUnverifiedIncome} className="accent-blue-700"/>Alertar cuando los ingresos del cliente aún no estén verificados</label>
            </div>

            <SubmitButton className="km-primary inline-flex items-center justify-center rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">Guardar políticas crediticias</SubmitButton>
          </PreservedActionForm>
        </section>
      </div>
    )}
  </main></div>;
}

