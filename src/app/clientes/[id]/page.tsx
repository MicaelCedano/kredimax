import { CustomerPhotoEditor } from "@/modules/customers/photo-editor";
import { responsibleLabel } from "@/modules/customers/portfolio";
import Link from "next/link";
import { MoneyInput } from "@/components/forms/money-input";
import { SubmitButton } from "@/components/forms/submit-button";
import {
  ArrowLeft,
  AtSign,
  Banknote,
  Building2,
  CalendarDays,
  ExternalLink,
  MapPin,
  Navigation,
  Phone,
  Save,
  UserRound,
  Users,
} from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { HomeLocationInput } from "@/components/forms/gps-location-input";
import { PreservedActionForm } from "@/components/forms/preserved-action-form";
import { formatDop } from "@/lib/format-money";
import { getTenantAccess } from "@/lib/security/tenant-access";
import { updateCustomer } from "@/modules/customers/actions";
import { CreditProfilePanel } from "@/modules/credit-evaluation/credit-profile-panel";
import { evaluateCustomerCredit } from "@/modules/credit-evaluation/engine";
import {
  loadCustomerInternalHistory,
  loadTenantCreditPolicy,
  type StoredCreditEvaluationRow,
} from "@/modules/credit-evaluation/service";
import { CustomerLabel } from "@/components/ui/status-badge";

type ApplicantSnapshot = {
  employer?: string | null;
  monthlyIncome?: string | number | null;
  reference?: { name?: string | null; phone?: string | null; identityNumber?: string | null } | null;
};

function toGoogleMapsUrl(raw: string): string {
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trimmed)}`;
}

export default async function CustomerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ evaluacion?: string }>;
}) {
  const [{ id }, { evaluacion }, access, writeAccess] = await Promise.all([
    params,
    searchParams,
    getTenantAccess("customers.read"),
    getTenantAccess("customers.write"),
  ]);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
  if (!access.ok && access.reason === "unauthenticated") redirect("/login");
  if (!access.ok) {
    return (
      <div className="min-h-screen bg-canvas">
        <Sidebar />
        <Topbar />
        <main id="main-content" tabIndex={-1} className="km-main px-5 py-10 lg:ml-[244px]">
          <Link href="/clientes" className="text-sm font-semibold text-accent">
            ← Volver a clientes
          </Link>
          <p className="mt-5 rounded-xl border border-warning-line bg-warning-soft p-4 text-sm text-warning">
            Tu usuario necesita una membresía activa con permiso para consultar clientes.
          </p>
        </main>
      </div>
    );
  }

  const [
    { data: customer, error },
    { data: applications },
    { data: evaluationRows },
    policy,
    internalHistory,
    { data: photo },
  ] = await Promise.all([
    access.supabase
      .from("customers")
      .select(
        "id, branch_id, full_name, identity_number, phone, address, social_media, home_location, employer, monthly_income, reference_name, reference_phone, reference_identity_number, occupation, employment_type, employment_tenure_months, verified_monthly_income, other_verifiable_income, essential_monthly_expenses, existing_monthly_debts, verified_monthly_debts, dependents_count, housing_type, monthly_rent_expense, work_reference_name, work_reference_phone, income_verification_status, identity_verification_status, employment_verification_status, financial_data_consent, created_at, created_by, created_by_name",
      )
      .eq("id", id)
      .eq("tenant_id", access.membership.tenant_id)
      .maybeSingle(),
    access.supabase
      .from("credit_applications")
      .select("quote_snapshot, created_at")
      .eq("customer_id", id)
      .eq("tenant_id", access.membership.tenant_id)
      .order("created_at", { ascending: false })
      .limit(5),
    access.supabase
      .from("customer_credit_evaluations")
      .select(
        "id, algorithm_version, status, total_score, risk_level, verification_state, monthly_payment_capacity, recommended_max_principal, recommended_max_sale_price, recommended_down_payment, recommended_term_months, trigger_event, factors, valid_until, created_at",
      )
      .eq("customer_id", id)
      .eq("tenant_id", access.membership.tenant_id)
      .order("created_at", { ascending: false })
      .limit(10),
    loadTenantCreditPolicy(access.supabase, access.membership.tenant_id),
    loadCustomerInternalHistory(access.supabase, access.membership.tenant_id, id),
    access.supabase.from("customer_photos").select("updated_at").eq("tenant_id", access.membership.tenant_id).eq("customer_id", id).maybeSingle(),
  ]);

  if (!customer || error) notFound();
  const canWrite =
    writeAccess.ok &&
    (writeAccess.membership.role === "tenant_admin" ||
      !writeAccess.membership.branch_id ||
      customer.branch_id === writeAccess.membership.branch_id);

  const applicantFallback = (applications ?? [])
    .map((app) => (app.quote_snapshot as { applicant?: ApplicantSnapshot } | null)?.applicant)
    .find(
      (app) =>
        app && (app.employer || app.monthlyIncome || app.reference?.name || app.reference?.phone),
    );

  const employer = customer.employer || applicantFallback?.employer || null;
  const monthlyIncome =
    customer.monthly_income !== null && customer.monthly_income !== undefined
      ? String(customer.monthly_income)
      : applicantFallback?.monthlyIncome !== null &&
          applicantFallback?.monthlyIncome !== undefined &&
          String(applicantFallback.monthlyIncome).trim() !== ""
        ? String(applicantFallback.monthlyIncome)
        : null;
  const verifiedMonthlyIncome =
    customer.verified_monthly_income !== null && customer.verified_monthly_income !== undefined
      ? String(customer.verified_monthly_income)
      : null;
  const otherVerifiableIncome =
    customer.other_verifiable_income !== null && customer.other_verifiable_income !== undefined
      ? String(customer.other_verifiable_income)
      : null;
  const essentialMonthlyExpenses =
    customer.essential_monthly_expenses !== null &&
    customer.essential_monthly_expenses !== undefined
      ? String(customer.essential_monthly_expenses)
      : null;
  const existingMonthlyDebts =
    customer.existing_monthly_debts !== null && customer.existing_monthly_debts !== undefined
      ? String(customer.existing_monthly_debts)
      : null;
  const verifiedMonthlyDebts =
    customer.verified_monthly_debts !== null && customer.verified_monthly_debts !== undefined
      ? String(customer.verified_monthly_debts)
      : null;
  const monthlyRentExpense =
    customer.monthly_rent_expense !== null && customer.monthly_rent_expense !== undefined
      ? String(customer.monthly_rent_expense)
      : null;

  const referenceName = customer.reference_name || applicantFallback?.reference?.name || null;
  const referencePhone = customer.reference_phone || applicantFallback?.reference?.phone || null;
  const referenceIdentityNumber = customer.reference_identity_number || applicantFallback?.reference?.identityNumber || null;
  const referenceSummary =
    referenceName || referencePhone || referenceIdentityNumber
      ? [referenceName, referencePhone, referenceIdentityNumber ? `Cédula: ${referenceIdentityNumber}` : null].filter(Boolean).join(" · ")
      : "No registrada";

  const evaluation = evaluateCustomerCredit(
    {
      identityNumber: customer.identity_number,
      phone: customer.phone,
      address: customer.address,
      occupation: customer.occupation,
      employmentType: customer.employment_type,
      employer,
      employmentTenureMonths: customer.employment_tenure_months,
      declaredMonthlyIncome: monthlyIncome,
      verifiedMonthlyIncome,
      otherVerifiableIncome,
      essentialMonthlyExpenses,
      existingMonthlyDebts,
      verifiedMonthlyDebts,
      dependentsCount: customer.dependents_count,
      housingType: customer.housing_type,
      monthlyRentExpense,
      referenceName,
      referencePhone,
      workReferenceName: customer.work_reference_name,
      workReferencePhone: customer.work_reference_phone,
      incomeVerificationStatus: customer.income_verification_status,
      identityVerificationStatus: customer.identity_verification_status,
      employmentVerificationStatus: customer.employment_verification_status,
      financialDataConsent: customer.financial_data_consent,
    },
    internalHistory,
    policy,
  );

  const historyList = (evaluationRows ?? []) as StoredCreditEvaluationRow[];
  const latestSavedAt = historyList[0]?.created_at ?? null;
  const inputClass =
    "mt-1.5 w-full rounded-lg border border-field-border bg-surface px-3 py-2.5 text-sm font-normal read-only:bg-subtle disabled:bg-subtle";

  return (
    <div className="min-h-screen bg-canvas">
      <Sidebar />
      <Topbar />
      <main id="main-content" tabIndex={-1} className="km-main px-4 pb-10 pt-7 sm:px-7 lg:ml-[244px] lg:px-7">
        <Link
          href="/clientes"
          className="mb-5 inline-flex items-center gap-2 text-xs font-semibold text-accent"
        >
          <ArrowLeft size={15} />
          Volver a clientes
        </Link>
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="km-page-title">Ficha del cliente</h1>
            <p className="mt-1.5 text-sm text-muted">
              Información personal, redes sociales, ubicación de la casa, datos laborales y perfil crediticio.
            </p>
          </div>
          <Link
            href="/solicitudes/nueva"
            className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-700"
          >
            Nueva solicitud de financiamiento
          </Link>
        </div>

        {(evaluacion === "recalculada" || evaluacion === "actualizada") && (
          <p
            role="status"
            className="mb-5 rounded-xl border border-positive-line bg-positive-soft px-4 py-3 text-sm text-positive"
          >
            {evaluacion === "recalculada"
              ? "La evaluación crediticia interna se recalculó y registró en el historial."
              : "El expediente y la evaluación crediticia interna del cliente se actualizaron correctamente."}
          </p>
        )}

        {/* KrediMax — Perfil crediticio */}
        <div className="mb-6">
          <CreditProfilePanel
            customerId={customer.id}
            evaluation={evaluation}
            evaluatedAt={latestSavedAt}
            historyRows={historyList}
            canWrite={canWrite}
            declaredDebts={existingMonthlyDebts}
            verifiedDebts={verifiedMonthlyDebts}
          />
        </div>

        <div className="grid items-start gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
          <section className="km-panel overflow-hidden">
            <div className="h-20 border-b border-line bg-accent-soft" />
            <div className="px-6 pb-6">
              <div className="-mt-8 inline-flex rounded-full border-4 border-surface bg-surface">
                <CustomerLabel name={customer.full_name} large avatarOnly photoUrl={photo ? `/api/clientes/${customer.id}/foto?v=${encodeURIComponent(photo.updated_at)}` : undefined} />
              </div>
              {canWrite && <CustomerPhotoEditor customerId={customer.id} hasPhoto={Boolean(photo)}/>}
              <Link href={`/recibos?customer=${customer.id}`} className="mt-4 inline-flex text-xs font-semibold text-accent">Ver vouchers del cliente →</Link>
              <h2 className="mt-4 break-words text-xl font-bold tracking-tight">
                {customer.full_name}
              </h2>
              <p className="mt-1 text-xs text-muted">
                {customer.identity_number || "Sin documento registrado"}
              </p>
              <dl className="mt-6 space-y-5 border-t border-line pt-5 text-sm">
                {[
                  {
                    icon: UserRound,
                    label: "Registrado por / Responsable de cobro",
                    value: responsibleLabel(customer.created_by, customer.created_by_name),
                  },
                  {
                    icon: Phone,
                    label: "Teléfono",
                    value: customer.phone || "No registrado",
                  },
                  {
                    icon: AtSign,
                    label: "Redes sociales",
                    value: customer.social_media || "No registradas",
                  },
                  {
                    icon: MapPin,
                    label: "Dirección",
                    value: customer.address || "No registrada",
                  },
                  {
                    icon: Building2,
                    label: "Empleo / empresa",
                    value:
                      [customer.occupation, employer].filter(Boolean).join(" · ") ||
                      "No registrado",
                  },
                  {
                    icon: Banknote,
                    label: "Ingreso mensual (Decl. / Comprobado)",
                    value:
                      monthlyIncome || verifiedMonthlyIncome
                        ? `${monthlyIncome ? formatDop(monthlyIncome) : "—"} / ${
                            verifiedMonthlyIncome ? formatDop(verifiedMonthlyIncome) : "—"
                          }`
                        : "No registrado",
                  },
                  {
                    icon: Users,
                    label: "Referencia personal",
                    value: referenceSummary,
                  },
                  {
                    icon: CalendarDays,
                    label: "Cliente desde",
                    value: new Intl.DateTimeFormat("es-DO", {
                      dateStyle: "long",
                      timeZone: "America/Santo_Domingo",
                    }).format(new Date(customer.created_at)),
                  },
                ].map(({ icon: FieldIcon, label, value }) => (
                  <div key={String(label)} className="flex gap-3">
                    <FieldIcon
                      size={16}
                      className="mt-0.5 shrink-0 text-muted"
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <dt className="text-xs text-muted">{String(label)}</dt>
                      <dd className="mt-1 break-words text-sm text-secondary">
                        {String(value)}
                      </dd>
                    </div>
                  </div>
                ))}

                {/* Ubicación de la casa con acceso directo a Google Maps */}
                <div className="flex gap-3">
                  <Navigation
                    size={16}
                    className="mt-0.5 shrink-0 text-muted"
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <dt className="text-xs text-muted">Ubicación de la casa</dt>
                    <dd className="mt-1 break-words text-sm text-secondary">
                      {customer.home_location || "No registrada"}
                    </dd>
                    {customer.home_location && (
                      <a
                        href={toGoogleMapsUrl(customer.home_location)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1.5 inline-flex items-center gap-1 rounded-md border border-accent-line bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent hover:bg-accent-soft"
                      >
                        Abrir ubicación en Google Maps
                        <ExternalLink size={12} aria-hidden />
                      </a>
                    )}
                  </div>
                </div>
              </dl>
            </div>
          </section>

          <div className="km-panel p-5 sm:p-7">
            <h2 className="flex items-center gap-2 text-base font-bold">
              <UserRound size={18} className="text-accent" aria-hidden />
              Datos del expediente y evaluación socioeconómica
            </h2>
            <p className="mt-1.5 text-xs text-muted">
              Al guardar los cambios se actualiza automáticamente la evaluación crediticia
              interna del cliente.
            </p>
            {!canWrite && (
              <p className="mt-5 rounded-lg bg-subtle p-3 text-xs text-secondary">
                Tu acceso es de consulta para este cliente; los cambios se realizan desde la
                sucursal asignada.
              </p>
            )}
            <PreservedActionForm
              action={updateCustomer}
              className="mt-6 space-y-6"
              messages={{
                invalid: "Revisa los campos; los cambios se conservaron.",
                "save-error":
                  "No se pudieron guardar los cambios. Tus datos siguen en el formulario.",
                "not-found": "El expediente ya no está disponible.",
                forbidden: "No tienes permiso para cambiar este expediente.",
                unavailable: "No se pudo verificar tu acceso; vuelve a intentar.",
              }}
            >
              <input type="hidden" name="id" value={customer.id} />

              {/* Datos personales, redes sociales y ubicación de la casa */}
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-semibold text-secondary sm:col-span-2">
                  Nombre completo *
                  <input
                    required
                    readOnly={!canWrite}
                    name="fullName"
                    defaultValue={customer.full_name}
                    maxLength={200}
                    className={`km-input ${inputClass}`}
                  />
                </label>
                <label className="block text-sm font-semibold text-secondary">
                  Cédula o documento
                  <input
                    readOnly={!canWrite}
                    name="identityNumber"
                    defaultValue={customer.identity_number ?? ""}
                    maxLength={40}
                    className={`km-input ${inputClass}`}
                  />
                </label>
                <label className="block text-sm font-semibold text-secondary">
                  Teléfono
                  <input
                    readOnly={!canWrite}
                    name="phone"
                    defaultValue={customer.phone ?? ""}
                    maxLength={40}
                    className={`km-input ${inputClass}`}
                  />
                </label>
                <label className="block text-sm font-semibold text-secondary sm:col-span-2">
                  Redes sociales (Instagram, Facebook, TikTok, etc.)
                  <input
                    readOnly={!canWrite}
                    name="socialMedia"
                    defaultValue={customer.social_media ?? ""}
                    maxLength={300}
                    placeholder="Ej. @usuario_ig · facebook.com/usuario"
                    className={`km-input ${inputClass}`}
                  />
                </label>
                <label className="block text-sm font-semibold text-secondary sm:col-span-2">
                  Dirección física
                  <textarea
                    readOnly={!canWrite}
                    name="address"
                    defaultValue={customer.address ?? ""}
                    maxLength={500}
                    rows={2}
                    placeholder="Calle, número, sector, municipio / provincia"
                    className={`km-input ${inputClass}`}
                  />
                </label>
                <div className="sm:col-span-2">
                  <HomeLocationInput
                    defaultValue={customer.home_location ?? ""}
                    readOnly={!canWrite}
                    inputClass={inputClass}
                  />
                </div>
              </div>

              {/* Información laboral y empresa */}
              <div className="border-t border-line pt-5">
                <h3 className="text-sm font-bold text-ink">
                  Información laboral y de la empresa
                </h3>
                <p className="mt-1 text-xs font-normal text-muted">
                  Ocupación, empresa donde trabaja, antigüedad y referencias laborales.
                </p>
                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                  <label className="block text-sm font-semibold text-secondary">
                    Ocupación
                    <input
                      readOnly={!canWrite}
                      name="occupation"
                      defaultValue={customer.occupation ?? ""}
                      maxLength={160}
                      placeholder="Ej. Analista, Comerciante"
                      className={`km-input ${inputClass}`}
                    />
                  </label>
                  <label className="block text-sm font-semibold text-secondary">
                    Tipo de empleo
                    <select
                      disabled={!canWrite}
                      name="employmentType"
                      defaultValue={customer.employment_type ?? ""}
                      className={`km-input ${inputClass}`}
                    >
                      <option value="">Selecciona una opción</option>
                      <option value="formal_employee">Empleado formal</option>
                      <option value="informal_employee">Empleado informal</option>
                      <option value="independent">Independiente / profesional</option>
                      <option value="business_owner">Dueño de negocio</option>
                      <option value="retired">Pensionado / jubilado</option>
                      <option value="unemployed">Sin empleo actual</option>
                    </select>
                  </label>
                  <label className="block text-sm font-semibold text-secondary">
                    Antigüedad laboral (meses)
                    <input
                      readOnly={!canWrite}
                      type="number"
                      min="0"
                      max="1200"
                      name="employmentTenureMonths"
                      defaultValue={customer.employment_tenure_months ?? ""}
                      placeholder="0"
                      className={`km-input ${inputClass}`}
                    />
                  </label>
                  <label className="block text-sm font-semibold text-secondary sm:col-span-3">
                    Empleo / empresa
                    <input
                      readOnly={!canWrite}
                      name="employer"
                      defaultValue={employer ?? ""}
                      maxLength={160}
                      placeholder="Nombre de la empresa o negocio donde trabaja"
                      className={`km-input ${inputClass}`}
                    />
                  </label>
                </div>
              </div>

              {/* Ingresos, gastos, vivienda y endeudamiento */}
              <div className="border-t border-line pt-5">
                <h3 className="text-sm font-bold text-ink">
                  Capacidad económica, gastos y endeudamiento
                </h3>
                <p className="mt-1 text-xs font-normal text-muted">
                  Distingue los montos declarados por el cliente de los comprobados
                  documentalmente.
                </p>
                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                  <label className="block text-sm font-semibold text-secondary">
                    Ingreso mensual declarado (RD$)
                    <MoneyInput
                      readOnly={!canWrite}
                      name="monthlyIncome"
                      defaultValue={monthlyIncome ?? ""}
                      inputMode="decimal"
                      maxLength={15}
                      placeholder="0.00"
                      className={`km-input ${inputClass}`}
                    />
                  </label>
                  <label className="block text-sm font-semibold text-secondary">
                    Ingreso mensual comprobado (RD$)
                    <MoneyInput
                      readOnly={!canWrite}
                      name="verifiedMonthlyIncome"
                      defaultValue={verifiedMonthlyIncome ?? ""}
                      inputMode="decimal"
                      maxLength={15}
                      placeholder="0.00"
                      className={`km-input ${inputClass}`}
                    />
                  </label>
                  <label className="block text-sm font-semibold text-secondary">
                    Otros ingresos verificables (RD$)
                    <MoneyInput
                      readOnly={!canWrite}
                      name="otherVerifiableIncome"
                      defaultValue={otherVerifiableIncome ?? ""}
                      inputMode="decimal"
                      maxLength={15}
                      placeholder="0.00"
                      className={`km-input ${inputClass}`}
                    />
                  </label>

                  <label className="block text-sm font-semibold text-secondary">
                    Gastos mensuales esenciales (RD$)
                    <MoneyInput
                      readOnly={!canWrite}
                      name="essentialMonthlyExpenses"
                      defaultValue={essentialMonthlyExpenses ?? ""}
                      inputMode="decimal"
                      maxLength={15}
                      placeholder="0.00"
                      className={`km-input ${inputClass}`}
                    />
                  </label>
                  <label className="block text-sm font-semibold text-secondary">
                    Deudas/cuotas declaradas (RD$)
                    <MoneyInput
                      readOnly={!canWrite}
                      name="existingMonthlyDebts"
                      defaultValue={existingMonthlyDebts ?? ""}
                      inputMode="decimal"
                      maxLength={15}
                      placeholder="0.00"
                      className={`km-input ${inputClass}`}
                    />
                  </label>
                  <label className="block text-sm font-semibold text-secondary">
                    Deudas/cuotas verificadas (RD$)
                    <MoneyInput
                      readOnly={!canWrite}
                      name="verifiedMonthlyDebts"
                      defaultValue={verifiedMonthlyDebts ?? ""}
                      inputMode="decimal"
                      maxLength={15}
                      placeholder="0.00"
                      className={`km-input ${inputClass}`}
                    />
                  </label>

                  <label className="block text-sm font-semibold text-secondary">
                    Tipo de vivienda
                    <select
                      disabled={!canWrite}
                      name="housingType"
                      defaultValue={customer.housing_type ?? ""}
                      className={`km-input ${inputClass}`}
                    >
                      <option value="">Selecciona una opción</option>
                      <option value="owned">Propia</option>
                      <option value="rented">Alquilada</option>
                      <option value="family">Familiar</option>
                      <option value="other">Otra</option>
                    </select>
                  </label>
                  <label className="block text-sm font-semibold text-secondary">
                    Gasto de alquiler mensual (RD$)
                    <MoneyInput
                      readOnly={!canWrite}
                      name="monthlyRentExpense"
                      defaultValue={monthlyRentExpense ?? ""}
                      inputMode="decimal"
                      maxLength={15}
                      placeholder="0.00"
                      className={`km-input ${inputClass}`}
                    />
                  </label>
                  <label className="block text-sm font-semibold text-secondary">
                    Dependientes económicos
                    <input
                      readOnly={!canWrite}
                      type="number"
                      min="0"
                      max="30"
                      name="dependentsCount"
                      defaultValue={customer.dependents_count ?? ""}
                      placeholder="0"
                      className={`km-input ${inputClass}`}
                    />
                  </label>
                </div>
              </div>

              {/* Referencias y estado de verificación */}
              <div className="border-t border-line pt-5">
                <h3 className="text-sm font-bold text-ink">
                  Referencias y estado de verificación
                </h3>
                <p className="mt-1 text-xs font-normal text-muted">
                  Las referencias son de contacto y validación; no sustituyen la capacidad
                  económica comprobada.
                </p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-semibold text-secondary">
                    Referencia personal
                    <input
                      readOnly={!canWrite}
                      name="referenceName"
                      defaultValue={referenceName ?? ""}
                      maxLength={160}
                      placeholder="Opcional"
                      className={`km-input ${inputClass}`}
                    />
                  </label>
                  <label className="block text-sm font-semibold text-secondary">Cédula de referencia<input readOnly={!canWrite} name="referenceIdentityNumber" defaultValue={referenceIdentityNumber ?? ""} inputMode="numeric" maxLength={13} pattern="[0-9]{3}-[0-9]{7}-[0-9]|[0-9]{11}" placeholder="000-0000000-0" className={`km-input ${inputClass}`}/></label>
                  <label className="block text-sm font-semibold text-secondary">
                    Teléfono de referencia personal
                    <input
                      readOnly={!canWrite}
                      type="tel"
                      name="referencePhone"
                      defaultValue={referencePhone ?? ""}
                      maxLength={40}
                      placeholder="Opcional"
                      className={`km-input ${inputClass}`}
                    />
                  </label>
                  <label className="block text-sm font-semibold text-secondary">
                    Referencia laboral
                    <input
                      readOnly={!canWrite}
                      name="workReferenceName"
                      defaultValue={customer.work_reference_name ?? ""}
                      maxLength={160}
                      placeholder="Opcional"
                      className={`km-input ${inputClass}`}
                    />
                  </label>
                  <label className="block text-sm font-semibold text-secondary">
                    Teléfono de referencia laboral
                    <input
                      readOnly={!canWrite}
                      type="tel"
                      name="workReferencePhone"
                      defaultValue={customer.work_reference_phone ?? ""}
                      maxLength={40}
                      placeholder="Opcional"
                      className={`km-input ${inputClass}`}
                    />
                  </label>
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                  <label className="block text-sm font-semibold text-secondary">
                    Estado de ingresos
                    <select
                      disabled={!canWrite}
                      name="incomeVerificationStatus"
                      defaultValue={customer.income_verification_status ?? "declared"}
                      className={`km-input ${inputClass}`}
                    >
                      <option value="declared">Declarado</option>
                      <option value="pending">Pendiente de verificación</option>
                      <option value="verified">Verificado documentalmente</option>
                    </select>
                  </label>
                  <label className="block text-sm font-semibold text-secondary">
                    Estado de identidad
                    <select
                      disabled={!canWrite}
                      name="identityVerificationStatus"
                      defaultValue={customer.identity_verification_status ?? "declared"}
                      className={`km-input ${inputClass}`}
                    >
                      <option value="declared">Declarado</option>
                      <option value="pending">Pendiente de verificación</option>
                      <option value="verified">Verificado con documento</option>
                    </select>
                  </label>
                  <label className="block text-sm font-semibold text-secondary">
                    Estado laboral
                    <select
                      disabled={!canWrite}
                      name="employmentVerificationStatus"
                      defaultValue={customer.employment_verification_status ?? "declared"}
                      className={`km-input ${inputClass}`}
                    >
                      <option value="declared">Declarado</option>
                      <option value="pending">Pendiente de verificación</option>
                      <option value="verified">Verificado</option>
                    </select>
                  </label>
                </div>

                <label className="mt-4 flex items-start gap-2.5 rounded-xl border border-line bg-subtle p-3.5 text-xs leading-5 text-secondary">
                  <input
                    type="checkbox"
                    disabled={!canWrite}
                    name="financialDataConsent"
                    defaultChecked={Boolean(customer.financial_data_consent)}
                    className="mt-0.5 accent-blue-700"
                  />
                  <span>
                    <b>Consentimiento Ley 172-13:</b> Confirmo que el cliente autorizó la
                    recopilación, verificación y conservación de su información socioeconómica y
                    laboral para fines exclusivos de evaluación crediticia interna en KrediMax.
                  </span>
                </label>
              </div>

              <SubmitButton
                disabled={!canWrite}
                className="km-primary inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-field-border"
              >
                <Save size={16} />
                Guardar expediente y actualizar evaluación
              </SubmitButton>
            </PreservedActionForm>
          </div>
        </div>
      </main>
    </div>
  );
}
