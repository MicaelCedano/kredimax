import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileCheck2,
  History,
  Info,
  RefreshCw,
  ShieldAlert,
  TrendingUp,
} from "lucide-react";
import { SubmitButton } from "@/components/forms/submit-button";
import { PreservedActionForm } from "@/components/forms/preserved-action-form";
import { formatDop } from "@/lib/format-money";
import { recalculateCustomerEvaluation } from "@/modules/credit-evaluation/actions";
import {
  riskLabelForLevel,
  type CreditEvaluationResult,
  type CreditRiskLevel,
} from "@/modules/credit-evaluation/engine";
import type { StoredCreditEvaluationRow } from "@/modules/credit-evaluation/service";

const triggerLabels: Record<string, string> = {
  customer_created: "Registro inicial del cliente",
  customer_updated: "Actualización de expediente",
  manual_recalculation: "Recálculo manual autorizado",
  payment_recorded: "Pago registrado en KrediMax",
  payment_reversed: "Reverso autorizado de pago",
  loan_activated: "Activación de financiamiento",
  application_created: "Nueva solicitud de crédito",
};

const verificationLabels: Record<string, { label: string; badgeClass: string }> = {
  verified: {
    label: "Información verificada",
    badgeClass: "border-positive-line bg-positive-soft text-positive",
  },
  pending: {
    label: "Pendiente de verificación",
    badgeClass: "border-warning-line bg-warning-soft text-warning",
  },
  declared: {
    label: "Datos declarados",
    badgeClass: "border-line bg-soft text-secondary",
  },
};

function riskStyles(level: CreditRiskLevel) {
  switch (level) {
    case "low":
      return {
        stroke: "#059669",
        badge: "border-positive-line bg-positive-soft text-positive",
        ringBg: "bg-positive-soft/60",
      };
    case "moderate_low":
      return {
        stroke: "#2563eb",
        badge: "border-accent-line bg-accent-soft text-accent",
        ringBg: "bg-accent-soft/60",
      };
    case "review_required":
      return {
        stroke: "#d97706",
        badge: "border-warning-line bg-warning-soft text-warning",
        ringBg: "bg-warning-soft/60",
      };
    case "high":
      return {
        stroke: "#e11d48",
        badge: "border-danger-line bg-danger-soft text-danger",
        ringBg: "bg-danger-soft/60",
      };
    default:
      return {
        stroke: "#64748b",
        badge: "border-line bg-soft text-secondary",
        ringBg: "bg-subtle",
      };
  }
}

export function CreditProfilePanel({
  customerId,
  evaluation,
  evaluatedAt,
  historyRows,
  canWrite,
  declaredDebts,
  verifiedDebts,
}: {
  customerId: string;
  evaluation: CreditEvaluationResult;
  evaluatedAt: string | null;
  historyRows: StoredCreditEvaluationRow[];
  canWrite: boolean;
  declaredDebts: string | null;
  verifiedDebts: string | null;
}) {
  const style = riskStyles(evaluation.riskLevel);
  const scoreValue = evaluation.totalScore ?? 0;
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const dashOffset =
    evaluation.status === "complete" && evaluation.totalScore !== null
      ? circumference - (Math.max(0, Math.min(100, scoreValue)) / 100) * circumference
      : circumference;

  const verificationMeta =
    verificationLabels[evaluation.verificationState] ?? verificationLabels.declared;

  return (
    <section
      aria-labelledby="credit-profile-heading"
      className="km-panel overflow-hidden border border-[#dce6f2]"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-gradient-to-r from-[#09203d] to-[#113461] px-5 py-4 text-white sm:px-7">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[.14em] text-blue-200">
            KrediMax — Perfil crediticio
          </p>
          <h2 id="credit-profile-heading" className="mt-0.5 text-lg font-bold tracking-tight">
            Evaluación crediticia interna y capacidad de financiamiento
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${verificationMeta.badgeClass}`}
          >
            <FileCheck2 size={13} aria-hidden />
            {verificationMeta.label}
          </span>
          {canWrite && (
            <PreservedActionForm
              action={recalculateCustomerEvaluation}
              messages={{
                invalid: "No se pudo identificar el expediente.",
                "save-error": "No se pudo recalcular la evaluación en este momento.",
                forbidden: "No tienes permiso para recalcular en esta sucursal.",
              }}
            >
              <input type="hidden" name="customerId" value={customerId} />
              <SubmitButton
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/20"
              >
                <RefreshCw size={13} aria-hidden />
                Recalcular evaluación
              </SubmitButton>
            </PreservedActionForm>
          )}
        </div>
      </div>

      <div className="p-5 sm:p-7">
        <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
          {/* Score Circular Gauge */}
          <div
            className={`flex flex-col items-center justify-center rounded-2xl border border-line/80 p-5 text-center ${style.ringBg}`}
          >
            <div className="relative grid h-32 w-32 place-items-center">
              <svg className="h-32 w-32 -rotate-90" viewBox="0 0 112 112" aria-hidden="true">
                <circle
                  cx="56"
                  cy="56"
                  r={radius}
                  stroke="#e2e8f0"
                  strokeWidth="10"
                  fill="transparent"
                />
                <circle
                  cx="56"
                  cy="56"
                  r={radius}
                  stroke={style.stroke}
                  strokeWidth="10"
                  strokeDasharray={circumference}
                  strokeDashoffset={dashOffset}
                  strokeLinecap="round"
                  fill="transparent"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                {evaluation.status === "complete" && evaluation.totalScore !== null ? (
                  <>
                    <span className="text-3xl font-extrabold tracking-tight text-ink">
                      {evaluation.totalScore}
                    </span>
                    <span className="text-[11px] font-semibold text-muted">de 100 pts</span>
                  </>
                ) : (
                  <span className="px-2 text-xs font-bold text-secondary">Sin calificar</span>
                )}
              </div>
            </div>

            <span
              className={`mt-3 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${style.badge}`}
            >
              {evaluation.riskLevel === "low" || evaluation.riskLevel === "moderate_low" ? (
                <CheckCircle2 size={13} aria-hidden />
              ) : (
                <AlertTriangle size={13} aria-hidden />
              )}
              {evaluation.riskLabel}
            </span>

            <p className="mt-2.5 text-[11px] leading-4 text-muted">
              {evaluatedAt
                ? `Última evaluación: ${new Intl.DateTimeFormat("es-DO", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "America/Santo_Domingo",
                  }).format(new Date(evaluatedAt))}`
                : "Evaluación calculada en tiempo real"}
            </p>
            <p className="mt-1 text-[10px] text-muted">
              Algoritmo {evaluation.algorithmVersion} · Score interno KrediMax
            </p>
          </div>

          {/* Financing Capacity Cards */}
          <div className="flex flex-col justify-between space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-line bg-subtle/70 p-3.5">
                <p className="text-[11px] font-semibold text-muted">
                  Cuota mensual máxima orientativa
                </p>
                <p className="km-amount mt-1.5 text-lg font-extrabold text-ink">
                  {formatDop(evaluation.monthlyPaymentCapacity)}
                </p>
                <p className="mt-1 text-[11px] text-muted">
                  Tope prudencial ({evaluation.policySnapshot.maxDebtToIncomePercent}% DTI máx.)
                </p>
              </div>

              <div className="rounded-xl border border-accent-line bg-accent-soft/50 p-3.5">
                <p className="text-[11px] font-semibold text-accent">
                  Monto máximo financiable
                </p>
                <p className="km-amount mt-1.5 text-lg font-extrabold text-accent">
                  {formatDop(evaluation.recommendedMaxPrincipal)}
                </p>
                <p className="mt-1 text-[11px] text-accent">
                  Capital neto a {evaluation.recommendedTermMonths} meses
                </p>
              </div>

              <div className="rounded-xl border border-positive-line bg-positive-soft/50 p-3.5">
                <p className="text-[11px] font-semibold text-positive">
                  Precio máximo sugerido del celular
                </p>
                <p className="km-amount mt-1.5 text-lg font-extrabold text-positive">
                  {formatDop(evaluation.recommendedMaxSalePrice)}
                </p>
                <p className="mt-1 text-[11px] text-positive">
                  Incluyendo inicial recomendada
                </p>
              </div>

              <div className="rounded-xl border border-line bg-subtle/70 p-3.5">
                <p className="text-[11px] font-semibold text-muted">
                  Inicial recomendada ({evaluation.policySnapshot.downPaymentPercent}%)
                </p>
                <p className="km-amount mt-1.5 text-lg font-extrabold text-ink">
                  {formatDop(evaluation.recommendedDownPayment)}
                </p>
                <p className="mt-1 text-[11px] text-muted">
                  Plazo sugerido: {evaluation.recommendedTermMonths} meses
                </p>
              </div>
            </div>

            {/* Internal KrediMax Payment Behavior & Debt Summary */}
            <div className="rounded-xl border border-line bg-surface p-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted">
                Historial interno en KrediMax y endeudamiento
              </h3>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4 lg:grid-cols-7">
                <div>
                  <dt className="text-muted">Financ. activos</dt>
                  <dd className="mt-1 font-bold text-ink">
                    {evaluation.historySummary.activeLoansCount}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Saldo pendiente</dt>
                  <dd className="km-amount mt-1 font-bold text-ink">
                    {formatDop(evaluation.historySummary.activePrincipalBalance)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Cuotas pagadas</dt>
                  <dd className="mt-1 font-bold text-positive">
                    {evaluation.historySummary.paidInstallmentsCount}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Cuotas atrasadas</dt>
                  <dd
                    className={`mt-1 font-bold ${
                      evaluation.historySummary.overdueInstallmentsCount > 0
                        ? "text-danger"
                        : "text-ink"
                    }`}
                  >
                    {evaluation.historySummary.overdueInstallmentsCount}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Días de atraso</dt>
                  <dd
                    className={`mt-1 font-bold ${
                      evaluation.historySummary.maxDaysPastDue > 0
                        ? "text-danger"
                        : "text-ink"
                    }`}
                  >
                    {evaluation.historySummary.maxDaysPastDue} días
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Completados</dt>
                  <dd className="mt-1 font-bold text-ink">
                    {evaluation.historySummary.completedLoansCount}
                  </dd>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <dt className="text-muted">Deudas ext. (Decl. / Verif.)</dt>
                  <dd className="km-amount mt-1 font-semibold text-secondary">
                    {declaredDebts ? formatDop(declaredDebts) : "RD$0.00"} /{" "}
                    {verifiedDebts ? formatDop(verifiedDebts) : "RD$0.00"}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </div>

        {/* Missing Data Banner when Incomplete or Unverified */}
        {evaluation.missingFields.length > 0 && (
          <div
            role="status"
            className="mt-5 rounded-xl border border-warning-line bg-warning-soft/90 p-4 text-xs text-warning"
          >
            <p className="flex items-center gap-1.5 font-bold">
              <Info size={15} className="shrink-0 text-warning" aria-hidden />
              {evaluation.status === "incomplete"
                ? "Evaluación incompleta: completa los siguientes datos para calcular la puntuación y capacidad:"
                : "Información recomendada para fortalecer la certeza de esta evaluación:"}
            </p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {evaluation.missingFields.map((item) => (
                <li
                  key={item}
                  className="rounded-md border border-warning-line/80 bg-surface px-2.5 py-1 text-[11px] font-medium text-warning"
                >
                  • {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Factor Breakdown & Drivers */}
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <div className="rounded-xl border border-line p-4 sm:p-5">
            <h3 className="flex items-center gap-2 text-sm font-bold text-ink">
              <TrendingUp size={16} className="text-accent" aria-hidden />
              Desglose de factores del score (0 a 100)
            </h3>
            <div className="mt-4 space-y-4">
              {evaluation.factors.map((factor) => {
                const pct =
                  factor.maxScore > 0
                    ? Math.round((factor.score / factor.maxScore) * 100)
                    : 0;
                const barColor =
                  factor.status === "positive"
                    ? "bg-emerald-600"
                    : factor.status === "neutral"
                      ? "bg-blue-600"
                      : factor.status === "warning"
                        ? "bg-warning-soft0"
                        : "bg-rose-600";
                return (
                  <div key={factor.key}>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-ink">{factor.label}</span>
                      <span className="tabular-nums font-bold text-ink">
                        {factor.score} / {factor.maxScore} pts
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-soft">
                      <div
                        className={`h-full rounded-full transition-all ${barColor}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="mt-1 text-[11px] leading-4 text-muted">
                      {factor.summary}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col justify-between space-y-4">
            <div className="rounded-xl border border-line p-4 sm:p-5">
              <h3 className="text-sm font-bold text-ink">
                Explicación de la evaluación
              </h3>
              {evaluation.positiveDrivers.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-semibold text-positive">
                    Factores que impulsan la puntuación
                  </p>
                  <ul className="mt-1.5 space-y-1.5 text-xs text-secondary">
                    {evaluation.positiveDrivers.map((item) => (
                      <li key={item} className="flex items-start gap-2">
                        <CheckCircle2
                          size={14}
                          className="mt-0.5 shrink-0 text-positive"
                          aria-hidden
                        />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {evaluation.negativeDrivers.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-semibold text-danger">
                    Factores que limitan o reducen la puntuación
                  </p>
                  <ul className="mt-1.5 space-y-1.5 text-xs text-secondary">
                    {evaluation.negativeDrivers.map((item) => (
                      <li key={item} className="flex items-start gap-2">
                        <ShieldAlert
                          size={14}
                          className="mt-0.5 shrink-0 text-danger"
                          aria-hidden
                        />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="mt-4 rounded-lg bg-subtle p-3 text-[11px] leading-5 text-muted">
                <b>Nota normativa y metodológica:</b> Este score es exclusivamente interno de
                KrediMax y no sustituye reportes de sociedades de información crediticia (Ley
                172-13). El monto recomendado es orientativo y no constituye una aprobación
                automática.
              </p>
            </div>

            {/* Expandable Formula & History Details */}
            <details className="rounded-xl border border-line bg-subtle/60 p-4 text-xs">
              <summary className="cursor-pointer font-semibold text-accent">
                Ver desglose matemático y fórmulas de capacidad (interés simple KrediMax)
              </summary>
              <ol className="mt-3 space-y-1.5 text-[11px] leading-5 text-secondary">
                {evaluation.capacityBreakdown.formulaSteps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </details>

            {historyRows.length > 1 && (
              <details className="rounded-xl border border-line bg-surface p-4 text-xs">
                <summary className="flex cursor-pointer items-center gap-1.5 font-semibold text-secondary">
                  <History size={14} className="text-accent" aria-hidden />
                  Evolución histórica de evaluaciones ({historyRows.length})
                </summary>
                <div className="mt-3 max-h-48 overflow-y-auto">
                  <table className="w-full text-left text-[11px]">
                    <thead className="border-b border-line text-muted">
                      <tr>
                        <th className="py-1.5">Fecha</th>
                        <th className="py-1.5">Evento</th>
                        <th className="py-1.5">Score</th>
                        <th className="py-1.5">Riesgo</th>
                        <th className="py-1.5 text-right">Precio máx.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {historyRows.map((row) => (
                        <tr key={row.id}>
                          <td className="py-1.5 text-secondary">
                            <span className="inline-flex items-center gap-1">
                              <Clock size={11} className="text-muted" aria-hidden />
                              {new Intl.DateTimeFormat("es-DO", {
                                dateStyle: "short",
                                timeStyle: "short",
                                timeZone: "America/Santo_Domingo",
                              }).format(new Date(row.created_at))}
                            </span>
                          </td>
                          <td className="py-1.5 text-secondary">
                            {triggerLabels[row.trigger_event] ?? row.trigger_event}
                          </td>
                          <td className="py-1.5 font-bold text-ink">
                            {row.total_score !== null ? `${row.total_score}/100` : "—"}
                          </td>
                          <td className="py-1.5 text-secondary">
                            {riskLabelForLevel((row.risk_level as CreditRiskLevel) ?? "unrated")}
                          </td>
                          <td className="py-1.5 text-right font-semibold tabular-nums text-ink">
                            {formatDop(String(row.recommended_max_sale_price ?? "0.00"))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
