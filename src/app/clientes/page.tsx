import { Feedback } from "@/components/ui/feedback";
import { PanelHeading } from "@/components/ui/panel-heading";
import Link from "next/link";
import { ArrowUpRight, Search, UserPlus, Users } from "lucide-react";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { formatDop } from "@/lib/format-money";
import { getTenantAccess } from "@/lib/security/tenant-access";
import { sanitizeSearchTerm } from "@/lib/validation/search-term";
import {
  evaluateCustomerCredit,
  riskLabelForLevel,
  type CreditRiskLevel,
} from "@/modules/credit-evaluation/engine";
import { NewCustomerFormWithPreview } from "@/modules/credit-evaluation/new-customer-form-with-preview";
import { loadTenantCreditPolicy } from "@/modules/credit-evaluation/service";
import { CustomerLabel } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";

const messages: Record<string, string> = {
  creado: "El cliente se guardó y su evaluación crediticia inicial quedó registrada.",
  actualizado: "Los cambios y la evaluación crediticia se guardaron correctamente.",
  invalid: "Revisa los campos. El nombre es obligatorio y los textos tienen límites de longitud.",
  duplicate: "Ya existe un registro con esos datos.",
  "save-error": "No se pudo guardar. Revisa los datos e inténtalo otra vez.",
  "no-membership": "Tu usuario aún no tiene acceso a una empresa. Asigna una membresía activa para continuar.",
  "tenant-selection-required": "Tu usuario pertenece a más de una empresa. Primero hay que definir el selector de empresa.",
  forbidden: "Tu rol no tiene permiso para consultar o guardar clientes.",
  unavailable: "No se pudo consultar el servicio local. Verifica que Supabase esté iniciado.",
  "not-found": "No se encontró el registro o ya no tienes acceso a él.",
  "branch-required": "Selecciona una sucursal activa permitida para guardar este cliente.",
};

function Notice({ state, error = false }: { state?: string; error?: boolean }) {
  if (!state || !messages[state]) return null;
  const isError = error || !["creado", "actualizado"].includes(state);
  return <Feedback tone={isError ? "error" : "success"} className="mb-4">{messages[state]}</Feedback>;
 }

function scoreBadgeStyle(level: CreditRiskLevel) {
  switch (level) {
    case "low":
      return "border-positive-line bg-positive-soft text-positive";
    case "moderate_low":
      return "border-accent-line bg-accent-soft text-accent";
    case "review_required":
      return "border-warning-line bg-warning-soft text-warning";
    case "high":
      return "border-danger-line bg-danger-soft text-danger";
    default:
      return "border-line bg-soft text-secondary";
  }
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; estado?: string; page?: string }>;
}) {
  const { q = "", estado, page: rawPage } = await searchParams;
  const page = Math.max(1, Math.min(100000, Number.parseInt(rawPage ?? "1", 10) || 1));
  const pageSize = 50;
  const searchTerm = sanitizeSearchTerm(q);
  const [access, writeAccess] = await Promise.all([
    getTenantAccess("customers.read"),
    getTenantAccess("customers.write"),
  ]);
  if (!access.ok && access.reason === "unauthenticated") redirect("/login");
  const [branchResult, policy] = access.ok
    ? await Promise.all([
        access.supabase
          .from("branches")
          .select("id,name")
          .eq("tenant_id", access.membership.tenant_id)
          .order("name"),
        loadTenantCreditPolicy(access.supabase, access.membership.tenant_id),
      ])
    : [{ data: [], error: null }, undefined];

  const branches = branchResult.data ?? [];
  const defaultBranchId = access.ok
    ? access.membership.branch_id ?? (branches.length === 1 ? branches[0].id : "")
    : "";
  const assignedBranchId =
    access.ok && access.membership.role !== "tenant_admin"
      ? access.membership.branch_id
      : null;

  let data = null;
  let error = null;
  let count = 0;
  if (access.ok) {
    let query = access.supabase
      .from("customers")
      .select(
        "id, full_name, identity_number, phone, address, employer, monthly_income, verified_monthly_income, occupation, employment_type, employment_tenure_months, income_verification_status, identity_verification_status, created_at",
        { count: "exact" },
      )
      .eq("tenant_id", access.membership.tenant_id);
    if (searchTerm) {
      query = query.or(
        `full_name.ilike.%${searchTerm}%,identity_number.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%,employer.ilike.%${searchTerm}%`,
      );
    }
    const result = await query
      .order("created_at", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);
    data = result.data;
    error = result.error;
    count = result.count ?? 0;
  }

  const rows = data ?? [];
  const photoVersions = new Map<string,string>();
  if (access.ok && rows.length) {
    const { data: portraits } = await access.supabase.from("customer_photos").select("customer_id,updated_at").eq("tenant_id",access.membership.tenant_id).in("customer_id",rows.map(row => row.id));
    for (const portrait of portraits ?? []) photoVersions.set(portrait.customer_id,portrait.updated_at);
  }
  const latestEvaluationsMap = new Map<
    string,
    {
      status: string;
      total_score: number | null;
      risk_level: string;
      recommended_max_sale_price: string | number;
    }
  >();

  if (access.ok && rows.length > 0) {
    const { data: evalRows } = await access.supabase
      .from("customer_credit_evaluations")
      .select("customer_id, status, total_score, risk_level, recommended_max_sale_price, created_at")
      .eq("tenant_id", access.membership.tenant_id)
      .in(
        "customer_id",
        rows.map((r) => r.id),
      )
      .order("created_at", { ascending: false });

    for (const ev of evalRows ?? []) {
      if (!latestEvaluationsMap.has(ev.customer_id)) {
        latestEvaluationsMap.set(ev.customer_id, ev);
      }
    }
  }

  const totalPages = Math.max(1, Math.ceil(count / pageSize));
  const accessReason = access.ok ? undefined : access.reason;
  const readError = error ? "unavailable" : undefined;

  return (
    <div className="min-h-screen bg-canvas">
      <Sidebar />
      <Topbar />
      <main id="main-content" tabIndex={-1} className="km-main px-4 pb-10 pt-7 sm:px-7 lg:ml-[244px] lg:px-7">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="km-page-title">Clientes</h1>
            <p className="mt-1 text-sm text-muted">
              Expedientes, datos laborales y evaluación crediticia interna de tus clientes.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-xs text-secondary">
            <Users size={15} />
            {access.ok
              ? `${count.toLocaleString("es-DO")} ${count === 1 ? "resultado" : "resultados"}`
              : "Acceso pendiente"}
          </div>
        </div>
        <Notice state={estado} error={!access.ok || Boolean(error)} />
        <Notice state={accessReason} error />
        <Notice state={readError} error />
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="km-panel min-w-0 overflow-hidden">
            <PanelHeading title="Expedientes" description={<>Página {page} de {totalPages} · búsqueda en toda la empresa.
                </>}><form className="relative w-full sm:w-64">
                <Search
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
                />
                <input
                  aria-label="Buscar clientes"
                  name="q"
                  defaultValue={q}
                  placeholder="Nombre, documento, teléfono o empresa"
                  className="km-input w-full pl-9"
                />
              </form></PanelHeading>
            {!access.ok || error ? (
              <div className="px-5 py-12 text-center text-sm text-muted">
                No fue posible cargar los expedientes.
              </div>
            ) : rows.length ? (
              <>
                <div className="divide-y divide-line px-5 md:hidden">
                  {rows.map((row) => {
                    const savedEval = latestEvaluationsMap.get(row.id);
                    const computedEval = savedEval
                      ? {
                          status: savedEval.status,
                          totalScore: savedEval.total_score,
                          riskLevel: (savedEval.risk_level as CreditRiskLevel) ?? "unrated",
                          maxPrice: String(savedEval.recommended_max_sale_price ?? "0.00"),
                        }
                      : (() => {
                          const res = evaluateCustomerCredit(
                            {
                              identityNumber: row.identity_number,
                              occupation: row.occupation,
                              employmentType: row.employment_type,
                              employer: row.employer,
                              employmentTenureMonths: row.employment_tenure_months,
                              declaredMonthlyIncome: row.monthly_income,
                              verifiedMonthlyIncome: row.verified_monthly_income,
                              incomeVerificationStatus: row.income_verification_status,
                              identityVerificationStatus: row.identity_verification_status,
                            },
                            undefined,
                            policy,
                          );
                          return {
                            status: res.status,
                            totalScore: res.totalScore,
                            riskLevel: res.riskLevel,
                            maxPrice: res.recommendedMaxSalePrice,
                          };
                        })();

                    return (
                      <div key={row.id} className="py-5">
                        <div className="flex items-start justify-between gap-2">
                          <CustomerLabel name={row.full_name} photoUrl={photoVersions.has(row.id) ? `/api/clientes/${row.id}/foto?v=${encodeURIComponent(photoVersions.get(row.id)!)}` : undefined} />
                          <span
                            className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${scoreBadgeStyle(
                              computedEval.riskLevel,
                            )}`}
                          >
                            {computedEval.status === "complete" &&
                            computedEval.totalScore !== null
                              ? `${computedEval.totalScore}/100 · ${riskLabelForLevel(
                                  computedEval.riskLevel,
                                )}`
                              : "Sin calificar"}
                          </span>
                        </div>
                        <dl className="my-4 grid grid-cols-2 gap-3 text-xs">
                          <div>
                            <dt className="text-muted">Documento</dt>
                            <dd className="mt-1 font-medium text-secondary">
                              {row.identity_number || "—"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted">Teléfono</dt>
                            <dd className="mt-1 font-medium text-secondary">
                              {row.phone || "—"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted">Empleo / empresa</dt>
                            <dd className="mt-1 font-medium text-secondary">
                              {row.employer || "—"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted">Precio máx. sugerido</dt>
                            <dd className="km-amount mt-1 font-semibold text-positive">
                              {computedEval.status === "complete"
                                ? formatDop(computedEval.maxPrice)
                                : "—"}
                            </dd>
                          </div>
                        </dl>
                        <Link
                          href={`/clientes/${row.id}`}
                          className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-accent"
                        >
                          Abrir ficha y perfil crediticio
                          <ArrowUpRight size={15} aria-hidden />
                        </Link>
                      </div>
                    );
                  })}
                </div>
                <div className="hidden overflow-x-auto md:block">
                  <table className="km-table min-w-[780px]">
                    <thead className="bg-subtle text-muted">
                      <tr>
                        <th className="px-5 py-3 font-semibold">Cliente</th>
                        <th className="px-4 py-3 font-semibold">Documento / Teléfono</th>
                        <th className="px-4 py-3 font-semibold">Empleo / empresa</th>
                        <th className="px-4 py-3 font-semibold">Perfil crediticio</th>
                        <th className="px-5 py-3 text-right font-semibold">Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => {
                        const savedEval = latestEvaluationsMap.get(row.id);
                        const computedEval = savedEval
                          ? {
                              status: savedEval.status,
                              totalScore: savedEval.total_score,
                              riskLevel:
                                (savedEval.risk_level as CreditRiskLevel) ?? "unrated",
                              maxPrice: String(
                                savedEval.recommended_max_sale_price ?? "0.00",
                              ),
                            }
                          : (() => {
                              const res = evaluateCustomerCredit(
                                {
                                  identityNumber: row.identity_number,
                                  occupation: row.occupation,
                                  employmentType: row.employment_type,
                                  employer: row.employer,
                                  employmentTenureMonths: row.employment_tenure_months,
                                  declaredMonthlyIncome: row.monthly_income,
                                  verifiedMonthlyIncome: row.verified_monthly_income,
                                  incomeVerificationStatus: row.income_verification_status,
                                  identityVerificationStatus:
                                    row.identity_verification_status,
                                },
                                undefined,
                                policy,
                              );
                              return {
                                status: res.status,
                                totalScore: res.totalScore,
                                riskLevel: res.riskLevel,
                                maxPrice: res.recommendedMaxSalePrice,
                              };
                            })();

                        const displayIncome =
                          row.verified_monthly_income ?? row.monthly_income;

                        return (
                          <tr key={row.id} className="border-t border-line">
                            <td className="px-5 py-3.5 font-semibold text-ink">
                              <CustomerLabel name={row.full_name} photoUrl={photoVersions.has(row.id) ? `/api/clientes/${row.id}/foto?v=${encodeURIComponent(photoVersions.get(row.id)!)}` : undefined} />
                              <p className="ml-12 mt-1 text-[11px] font-normal text-muted">
                                Alta{" "}
                                {new Intl.DateTimeFormat("es-DO", {
                                  dateStyle: "medium",
                                  timeZone: "America/Santo_Domingo",
                                }).format(new Date(row.created_at))}
                              </p>
                            </td>
                            <td className="whitespace-nowrap px-4 py-3.5 text-secondary">
                              <span className="block font-medium text-secondary">
                                {row.identity_number || "—"}
                              </span>
                              <span className="block text-[11px] text-muted">
                                {row.phone || "Sin teléfono"}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 text-secondary">
                              <span className="block font-medium text-secondary">
                                {row.employer || row.occupation || "—"}
                              </span>
                              {displayIncome && (
                                <span className="block text-[11px] text-muted">
                                  {formatDop(String(displayIncome))}/mes
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3.5">
                              <span
                                className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${scoreBadgeStyle(
                                  computedEval.riskLevel,
                                )}`}
                              >
                                {computedEval.status === "complete" &&
                                computedEval.totalScore !== null
                                  ? `${computedEval.totalScore}/100 · ${riskLabelForLevel(
                                      computedEval.riskLevel,
                                    )}`
                                  : "Evaluación incompleta"}
                              </span>
                              {computedEval.status === "complete" && (
                                <span className="km-amount mt-1 block text-[11px] font-semibold text-secondary">
                                  Hasta {formatDop(computedEval.maxPrice)}
                                </span>
                              )}
                            </td>
                            <td className="px-5 py-3.5 text-right">
                              <Link
                                href={`/clientes/${row.id}`}
                                className="inline-flex items-center gap-1 whitespace-nowrap font-semibold text-accent hover:underline"
                              >
                                Abrir ficha
                                <ArrowUpRight size={14} aria-hidden />
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <nav
                  aria-label="Paginación de clientes"
                  className="flex items-center justify-between border-t border-line px-5 py-3 text-xs"
                >
                  <Link
                    aria-disabled={page <= 1}
                    className={
                      page <= 1
                        ? "pointer-events-none text-muted"
                        : "font-semibold text-accent"
                    }
                    href={`/clientes?q=${encodeURIComponent(q)}&page=${page - 1}`}
                  >
                    Anterior
                  </Link>
                  <span>
                    Página {page} de {totalPages}
                  </span>
                  <Link
                    aria-disabled={page >= totalPages}
                    className={
                      page >= totalPages
                        ? "pointer-events-none text-muted"
                        : "font-semibold text-accent"
                    }
                    href={`/clientes?q=${encodeURIComponent(q)}&page=${page + 1}`}
                  >
                    Siguiente
                  </Link>
                </nav>
              </>
            ) : (
              <EmptyState
                search={Boolean(q)}
                title={q ? "No encontramos ese cliente" : "Todavía no hay clientes"}
                description={
                  q
                    ? "Prueba con otro nombre, documento o número de teléfono."
                    : "Crea tu primer expediente con el formulario de nuevo cliente."
                }
                href={q ? "/clientes" : undefined}
                action="Limpiar búsqueda"
              />
            )}
          </section>
          <section className="km-panel h-fit p-5">
            <PanelHeading title="Nuevo cliente" description="Registra el expediente y estima su capacidad crediticia al instante." icon={UserPlus} inset="compact"/>
            {writeAccess.ok ? (
              branches.length ? (
                <NewCustomerFormWithPreview
                  branches={branches}
                  defaultBranchId={defaultBranchId}
                  assignedBranchId={assignedBranchId}
                  policy={policy}
                />
              ) : (
                <p
                  role="alert"
                  className="rounded-lg bg-warning-soft p-3 text-xs leading-5 text-warning"
                >
                  No tienes sucursales disponibles para asignar clientes.
                </p>
              )
            ) : (
              <p className="rounded-lg bg-subtle p-3 text-xs leading-5 text-secondary">
                Tu rol permite consultar, pero no crear clientes.
              </p>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

