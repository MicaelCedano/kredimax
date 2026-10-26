"use client";

import { useMemo, useState } from "react";
import { MoneyInput } from "@/components/forms/money-input";
import { SubmitButton } from "@/components/forms/submit-button";
import { AlertTriangle, CheckCircle2, Gauge, UserPlus } from "lucide-react";
import { HomeLocationInput } from "@/components/forms/gps-location-input";
import { PreservedActionForm } from "@/components/forms/preserved-action-form";
import { formatDop } from "@/lib/format-money";
import { formatIdentityInput } from "@/modules/financing/input-format";
import { createCustomer } from "@/modules/customers/actions";
import {
  DEFAULT_CREDIT_POLICY_SETTINGS,
  EMPTY_PAYMENT_HISTORY,
  evaluateCustomerCredit,
  type CreditPolicySettings,
} from "@/modules/credit-evaluation/engine";

type BranchOption = { id: string; name: string };

export function NewCustomerFormWithPreview({
  branches,
  defaultBranchId,
  assignedBranchId,
  policy = DEFAULT_CREDIT_POLICY_SETTINGS,
}: {
  branches: BranchOption[];
  defaultBranchId: string;
  assignedBranchId: string | null;
  policy?: CreditPolicySettings;
}) {
  const [identityNumber, setIdentityNumber] = useState("");
  const [occupation, setOccupation] = useState("");
  const [employmentType, setEmploymentType] = useState("formal_employee");
  const [employer, setEmployer] = useState("");
  const [employmentTenureMonths, setEmploymentTenureMonths] = useState("");
  const [monthlyIncome, setMonthlyIncome] = useState("");
  const [verifiedMonthlyIncome, setVerifiedMonthlyIncome] = useState("");
  const [otherVerifiableIncome, setOtherVerifiableIncome] = useState("");
  const [essentialMonthlyExpenses, setEssentialMonthlyExpenses] = useState("");
  const [existingMonthlyDebts, setExistingMonthlyDebts] = useState("");
  const [dependentsCount, setDependentsCount] = useState("");
  const [housingType, setHousingType] = useState("rented");
  const [monthlyRentExpense, setMonthlyRentExpense] = useState("");
  const [incomeVerificationStatus, setIncomeVerificationStatus] = useState("declared");
  const [identityVerificationStatus, setIdentityVerificationStatus] = useState("declared");
  const [financialDataConsent, setFinancialDataConsent] = useState(false);

  const preview = useMemo(() => {
    return evaluateCustomerCredit(
      {
        identityNumber,
        occupation,
        employmentType,
        employer,
        employmentTenureMonths: employmentTenureMonths ? Number.parseInt(employmentTenureMonths, 10) : null,
        declaredMonthlyIncome: monthlyIncome,
        verifiedMonthlyIncome,
        otherVerifiableIncome,
        essentialMonthlyExpenses,
        existingMonthlyDebts,
        dependentsCount: dependentsCount ? Number.parseInt(dependentsCount, 10) : null,
        housingType,
        monthlyRentExpense,
        incomeVerificationStatus,
        identityVerificationStatus,
        financialDataConsent,
      },
      EMPTY_PAYMENT_HISTORY,
      policy,
    );
  }, [
    identityNumber,
    occupation,
    employmentType,
    employer,
    employmentTenureMonths,
    monthlyIncome,
    verifiedMonthlyIncome,
    otherVerifiableIncome,
    essentialMonthlyExpenses,
    existingMonthlyDebts,
    dependentsCount,
    housingType,
    monthlyRentExpense,
    incomeVerificationStatus,
    identityVerificationStatus,
    financialDataConsent,
    policy,
  ]);

  const inputClass =
    "mt-1.5 w-full rounded-lg border border-field-border bg-surface px-3 py-2 text-sm font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-accent-line";

  return (
    <PreservedActionForm
      action={createCustomer}
      className="space-y-3"
      messages={{
        invalid: "Revisa los datos del cliente; los campos se conservaron.",
        duplicate: "Ya existe un cliente con ese documento. Verifica la cédula.",
        "save-error": "No se pudo guardar. Tus datos siguen en el formulario.",
        "branch-required": "Selecciona una sucursal disponible.",
        forbidden: "No tienes permiso para guardar en esa sucursal.",
        unavailable: "No se pudo consultar el servicio; vuelve a intentar.",
      }}
    >
      <label className="block text-sm font-semibold text-secondary">
        Nombre completo *
        <input name="fullName" required maxLength={200} className={`km-input ${inputClass}`} />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-semibold text-secondary">
          Cédula o documento
          <input
            name="identityNumber"
            maxLength={40}
            value={identityNumber}
            onChange={(e) => setIdentityNumber(e.target.value)}
            className={`km-input ${inputClass}`}
          />
        </label>
        <label className="block text-sm font-semibold text-secondary">
          Teléfono
          <input name="phone" type="tel" maxLength={40} className={`km-input ${inputClass}`} />
        </label>
      </div>

      <label className="block text-sm font-semibold text-secondary">
        Redes sociales (Instagram, Facebook, TikTok, etc.)
        <input
          name="socialMedia"
          maxLength={300}
          placeholder="Ej. @usuario_ig · facebook.com/usuario"
          className={`km-input ${inputClass}`}
        />
      </label>

      <label className="block text-sm font-semibold text-secondary">
        Sucursal *
        <select
          name="branchId"
          required
          defaultValue={defaultBranchId}
          disabled={Boolean(assignedBranchId)}
          className="km-input mt-1.5 w-full rounded-lg border border-field-border bg-surface px-3 py-2 text-sm font-normal disabled:bg-subtle"
        >
          <option value="" disabled>
            Selecciona una sucursal
          </option>
          {branches.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.name}
            </option>
          ))}
        </select>
        {assignedBranchId && <input type="hidden" name="branchId" value={assignedBranchId} />}
      </label>

      <label className="block text-sm font-semibold text-secondary">
        Dirección física
        <textarea
          name="address"
          maxLength={500}
          rows={2}
          placeholder="Calle, número, sector, municipio / provincia"
          className="km-input mt-1.5 w-full resize-y rounded-lg border border-field-border px-3 py-2 text-sm font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-accent-line"
        />
      </label>

      <HomeLocationInput inputClass={inputClass} />

      <div className="border-t border-line pt-3">
        <p className="mb-1 text-xs font-bold text-ink">
          Datos laborales y capacidad económica (opcionales)
        </p>
        <p className="mb-3 text-[11px] leading-4 text-muted">
          Permiten ejecutar la evaluación crediticia interna automáticamente al guardar.
        </p>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-secondary">
              Ocupación
              <input
                name="occupation"
                maxLength={160}
                placeholder="Ej. Técnico, Comerciante"
                value={occupation}
                onChange={(e) => setOccupation(e.target.value)}
                className={`km-input ${inputClass}`}
              />
            </label>
            <label className="block text-xs font-semibold text-secondary">
              Tipo de empleo
              <select
                name="employmentType"
                value={employmentType}
                onChange={(e) => setEmploymentType(e.target.value)}
                className={`km-input ${inputClass}`}
              >
                <option value="formal_employee">Empleado formal</option>
                <option value="informal_employee">Empleado informal</option>
                <option value="independent">Independiente / profesional</option>
                <option value="business_owner">Dueño de negocio</option>
                <option value="retired">Pensionado / jubilado</option>
                <option value="unemployed">Sin empleo actual</option>
              </select>
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-secondary">
              Empleo / empresa
              <input
                name="employer"
                maxLength={160}
                placeholder="Opcional"
                value={employer}
                onChange={(e) => setEmployer(e.target.value)}
                className={`km-input ${inputClass}`}
              />
            </label>
            <label className="block text-xs font-semibold text-secondary">
              Antigüedad (meses)
              <input
                type="number"
                name="employmentTenureMonths"
                min="0"
                max="1200"
                placeholder="Ej. 18"
                value={employmentTenureMonths}
                onChange={(e) => setEmploymentTenureMonths(e.target.value)}
                className={`km-input ${inputClass}`}
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-secondary">
              Ingreso declarado (RD$)
              <MoneyInput
                name="monthlyIncome"
                inputMode="decimal"
                maxLength={15}
                placeholder="0.00"
                value={monthlyIncome}
                onChange={(e) => setMonthlyIncome(e.target.value)}
                className={`km-input ${inputClass}`}
              />
            </label>
            <label className="block text-xs font-semibold text-secondary">
              Ingreso comprobado (RD$)
              <MoneyInput
                name="verifiedMonthlyIncome"
                inputMode="decimal"
                maxLength={15}
                placeholder="0.00"
                value={verifiedMonthlyIncome}
                onChange={(e) => setVerifiedMonthlyIncome(e.target.value)}
                className={`km-input ${inputClass}`}
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-secondary">
              Otros ingresos verif. (RD$)
              <MoneyInput
                name="otherVerifiableIncome"
                inputMode="decimal"
                maxLength={15}
                placeholder="0.00"
                value={otherVerifiableIncome}
                onChange={(e) => setOtherVerifiableIncome(e.target.value)}
                className={`km-input ${inputClass}`}
              />
            </label>
            <label className="block text-xs font-semibold text-secondary">
              Gastos esenciales (RD$)
              <MoneyInput
                name="essentialMonthlyExpenses"
                inputMode="decimal"
                maxLength={15}
                placeholder="0.00"
                value={essentialMonthlyExpenses}
                onChange={(e) => setEssentialMonthlyExpenses(e.target.value)}
                className={`km-input ${inputClass}`}
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-secondary">
              Deudas/cuotas actuales (RD$)
              <MoneyInput
                name="existingMonthlyDebts"
                inputMode="decimal"
                maxLength={15}
                placeholder="0.00"
                value={existingMonthlyDebts}
                onChange={(e) => setExistingMonthlyDebts(e.target.value)}
                className={`km-input ${inputClass}`}
              />
            </label>
            <label className="block text-xs font-semibold text-secondary">
              Dependientes económicos
              <input
                type="number"
                name="dependentsCount"
                min="0"
                max="30"
                placeholder="0"
                value={dependentsCount}
                onChange={(e) => setDependentsCount(e.target.value)}
                className={`km-input ${inputClass}`}
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-secondary">
              Tipo de vivienda
              <select
                name="housingType"
                value={housingType}
                onChange={(e) => setHousingType(e.target.value)}
                className={`km-input ${inputClass}`}
              >
                <option value="rented">Alquilada</option>
                <option value="owned">Propia</option>
                <option value="family">Familiar</option>
                <option value="other">Otra</option>
              </select>
            </label>
            <label className="block text-xs font-semibold text-secondary">
              Alquiler mensual (RD$)
              <MoneyInput
                name="monthlyRentExpense"
                inputMode="decimal"
                maxLength={15}
                placeholder="0.00"
                value={monthlyRentExpense}
                onChange={(e) => setMonthlyRentExpense(e.target.value)}
                className={`km-input ${inputClass}`}
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-secondary">
              Verificación de ingresos
              <select
                name="incomeVerificationStatus"
                value={incomeVerificationStatus}
                onChange={(e) => setIncomeVerificationStatus(e.target.value)}
                className={`km-input ${inputClass}`}
              >
                <option value="declared">Declarado</option>
                <option value="pending">Pendiente de verificar</option>
                <option value="verified">Verificado</option>
              </select>
            </label>
            <label className="block text-xs font-semibold text-secondary">
              Verificación de identidad
              <select
                name="identityVerificationStatus"
                value={identityVerificationStatus}
                onChange={(e) => setIdentityVerificationStatus(e.target.value)}
                className={`km-input ${inputClass}`}
              >
                <option value="declared">Declarada</option>
                <option value="pending">Pendiente de verificar</option>
                <option value="verified">Verificada</option>
              </select>
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-secondary">
              Referencia personal
              <input
                name="referenceName"
                maxLength={160}
                placeholder="Opcional"
                className={`km-input ${inputClass}`}
              />
            </label>
            <label className="block text-xs font-semibold text-secondary">Cédula de referencia<input name="referenceIdentityNumber" inputMode="numeric" maxLength={13} pattern="[0-9]{3}-[0-9]{7}-[0-9]" placeholder="000-0000000-0" onChange={event => { event.currentTarget.value = formatIdentityInput(event.currentTarget.value); }} className={`km-input ${inputClass}`}/></label>
            <label className="block text-xs font-semibold text-secondary">
              Teléfono de referencia
              <input
                type="tel"
                name="referencePhone"
                maxLength={40}
                placeholder="Opcional"
                className={`km-input ${inputClass}`}
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-secondary">
              Referencia laboral
              <input
                name="workReferenceName"
                maxLength={160}
                placeholder="Supervisor o RRHH"
                className={`km-input ${inputClass}`}
              />
            </label>
            <label className="block text-xs font-semibold text-secondary">
              Teléfono ref. laboral
              <input
                type="tel"
                name="workReferencePhone"
                maxLength={40}
                placeholder="Opcional"
                className={`km-input ${inputClass}`}
              />
            </label>
          </div>

          <label className="flex items-start gap-2 rounded-lg border border-line bg-subtle p-2.5 text-[11px] leading-4 text-secondary">
            <input
              type="checkbox"
              name="financialDataConsent"
              checked={financialDataConsent}
              onChange={(e) => setFinancialDataConsent(e.target.checked)}
              className="mt-0.5 accent-blue-700"
            />
            <span>
              El titular autoriza el tratamiento confidencial de sus datos socioeconómicos
              para la evaluación crediticia interna de KrediMax conforme a la Ley 172-13.
            </span>
          </label>
        </div>
      </div>

      {/* Live Credit Capacity Preview */}
      <div
        aria-live="polite"
        className="rounded-xl border border-accent-line bg-gradient-to-br from-blue-50/80 to-slate-50 p-3.5 text-xs"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 font-bold text-ink">
            <Gauge size={15} className="text-accent" aria-hidden />
            Capacidad estimada del cliente
          </span>
          {preview.status === "complete" && preview.totalScore !== null ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2.5 py-0.5 text-[11px] font-bold text-accent shadow-xs">
              {preview.riskLevel === "low" || preview.riskLevel === "moderate_low" ? (
                <CheckCircle2 size={12} className="text-positive" aria-hidden />
              ) : (
                <AlertTriangle size={12} className="text-warning" aria-hidden />
              )}
              {preview.totalScore}/100 · {preview.riskLabel}
            </span>
          ) : (
            <span className="rounded-full bg-warning-soft px-2.5 py-0.5 text-[11px] font-semibold text-warning">
              Evaluación incompleta
            </span>
          )}
        </div>

        {preview.status === "complete" ? (
          <dl className="mt-2.5 grid grid-cols-2 gap-2 border-t border-accent-line pt-2.5 text-[11px]">
            <div>
              <dt className="text-muted">Cuota máx. orientativa</dt>
              <dd className="km-amount font-bold text-ink">
                {formatDop(preview.monthlyPaymentCapacity)}/mes
              </dd>
            </div>
            <div>
              <dt className="text-muted">Capital financiable</dt>
              <dd className="km-amount font-bold text-accent">
                {formatDop(preview.recommendedMaxPrincipal)}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Precio máx. celular</dt>
              <dd className="km-amount font-bold text-positive">
                {formatDop(preview.recommendedMaxSalePrice)}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Inicial requerida</dt>
              <dd className="km-amount font-bold text-ink">
                {formatDop(preview.recommendedDownPayment)}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-1.5 text-[11px] leading-4 text-secondary">
            Ingresa el ingreso mensual (declarado o comprobado) para previsualizar el límite
            recomendado. Puedes guardar el cliente aun sin completar estos datos.
          </p>
        )}
      </div>

      <SubmitButton className="km-primary inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
        <UserPlus size={16} />
        Guardar cliente y evaluar
      </SubmitButton>
    </PreservedActionForm>
  );
}
