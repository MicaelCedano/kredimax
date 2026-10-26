import { CustomerCollectionsPanel, type CollectionQuery } from "@/modules/customers/collection-panel";
import { EmptyState } from "@/components/ui/empty-state";
import { PanelHeading } from "@/components/ui/panel-heading";
import { Feedback } from "@/components/ui/feedback";
import Link from "next/link";
import { SubmitButton } from "@/components/forms/submit-button";
import { notFound, redirect } from "next/navigation";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { navigation } from "@/lib/navigation";
import { centsToDecimal, decimalToCents, formatDop, formatDopCents } from "@/lib/format-money";
import { getTenantAccess } from "@/lib/security/tenant-access";
import { PaymentReversalDialog } from "@/modules/payments/payment-reversal-form";
import { PaymentDialog } from "@/modules/payments/payment-form";
import { CustomerLabel, StatusBadge } from "@/components/ui/status-badge";
import { CalendarClock, CircleAlert, ReceiptText } from "lucide-react";
import { createTenantBranch, updateMembership } from "@/modules/tenant/actions";
import { PreservedActionForm } from "@/components/forms/preserved-action-form";
import { randomUUID } from "node:crypto";

const config: Record<string, { permission: string; title: string; subtitle: string }> = {
  financiamientos: { permission: "financing.read", title: "Financiamientos", subtitle: "Préstamos activos y estado de sus cuotas." },
  cobros: { permission: "payments.read", title: "Cobros", subtitle: "Registra pagos y consulta el historial de tu cartera." },
  mdm: { permission: "mdm.command", title: "MDM", subtitle: "Desactivado por ahora; historial local en solo lectura." },
  reportes: { permission: "reports.read", title: "Reportes", subtitle: "Indicadores calculados con los datos locales disponibles." },
  auditoria: { permission: "audit.read", title: "Auditoría", subtitle: "Registro cronológico de acciones registradas por la aplicación." },
  sucursales: { permission: "branches.read", title: "Sucursales", subtitle: "Administra las sucursales de la empresa. Los roles operativos quedan limitados a la sucursal asignada." },
  usuarios: { permission: "tenant.manage", title: "Usuarios", subtitle: "Membresías y roles asignados en esta empresa." },
};

type Row = Record<string, React.ReactNode>;
function Panel({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) { return <section className="km-panel overflow-hidden"><PanelHeading title={title} description={description}/>{children}</section>; }
function Table({ headers, rows, empty, collectionLayout }: { headers: string[]; rows: Row[]; empty: string; collectionLayout?: "installment" | "payment" }) {
  return rows.length ? <>
    <div className="space-y-3 p-3 md:hidden">
      {rows.map((row, i) => collectionLayout ? <article key={String(row.key ?? i)} className="km-panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">{row[collectionLayout === "installment" ? "c0" : "c1"]}{row[collectionLayout === "installment" ? "c5" : "c4"]}</div>
        <p className="mt-3 text-xs text-muted">{collectionLayout === "installment" ? "Vencimiento: " : ""}{row[collectionLayout === "installment" ? "c1" : "c0"]}</p>
        {collectionLayout === "installment" ? <dl className="mt-4 grid grid-cols-3 gap-2 rounded-lg bg-subtle p-3">{[["Cuota", "c2"], ["Abonado", "c3"], ["Saldo", "c4"]].map(([label, column]) => <div key={column}><dt className="text-[10px] text-muted">{label}</dt><dd className="mt-1 text-xs tabular-nums">{row[column]}</dd></div>)}</dl> : <div className="mt-4 flex items-start justify-between gap-3"><span className="text-lg font-bold tabular-nums">{row.c2}</span><span className="text-right text-xs">{row.c3}</span></div>}
        <div className="mt-4 flex justify-end border-t border-line pt-3">{row[collectionLayout === "installment" ? "c6" : "c5"]}</div>
      </article> : <article key={String(row.key ?? i)} className="rounded-lg border border-line bg-surface p-3">
        <dl className="space-y-3">
          {headers.slice(1).map((header, j) => <div key={header} className="grid grid-cols-[5rem_minmax(0,1fr)] items-start gap-3">
            <dt className="pt-1 text-[11px] font-semibold text-muted">{header}</dt>
            <dd className="min-w-0 break-words text-xs text-secondary">{row[`c${j}`] ?? "—"}</dd>
          </div>)}
        </dl>
      </article>)}
    </div>
    <div className="hidden overflow-x-auto md:block"><table className="km-table min-w-[620px]"><thead className="bg-subtle text-xs text-muted"><tr>{headers.slice(1).map((h) => <th key={h} className="px-4 py-3 font-semibold first:pl-5 last:pr-5">{h}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={String(row.key ?? i)} className="border-t border-line transition-colors hover:bg-subtle/60">{headers.slice(1).map((h, j) => <td key={h} className="px-4 py-4 text-secondary first:pl-5 last:pr-5">{row[`c${j}`] ?? "—"}</td>)}</tr>)}</tbody></table></div>
  </> : <EmptyState title={empty} description="Los registros aparecerán aquí cuando estén disponibles."/>;
}
function tableRows(rows: Record<string, unknown>[], values: (r: Record<string, unknown>) => React.ReactNode[]) {
  return rows.map((r) => ({ key: String(r.id ?? ""), ...Object.fromEntries(values(r).map((value, i) => [`c${i}`, value])) }));
}
function Notice({ message, error = false }: { message: string; error?: boolean }) {
  return <Feedback tone={error ? "warning" : "info"} className="mb-4">{message}</Feedback>;
 }

export default async function ModulePage({ params, searchParams }: { params: Promise<{ section: string }>; searchParams: Promise<{ estado?: string; loanId?: string; amount?: string; idempotencyKey?: string; paymentMethod?: string; reference?: string; from?: string; to?: string; page?: string; paymentPage?: string; devicePage?: string; commandPage?: string; deviceSearch?: string } & CollectionQuery> }) {
  const [{ section }, query] = await Promise.all([params, searchParams]);
  const item = navigation.find((x) => x.href.slice(1) === section);
  if (!item) notFound();
  const moduleConfig = config[section];
  if (!moduleConfig) notFound();
  const access = await getTenantAccess(moduleConfig.permission);
  if (!access.ok && access.reason === "unauthenticated") redirect("/login");
  const tenantId = access.ok ? access.membership.tenant_id : "";
  let content: React.ReactNode = <Notice error message={access.ok ? "No fue posible consultar el módulo." : `Acceso pendiente: ${access.reason}`} />;
  if (access.ok) {
    const db = access.supabase;
    if (section === "financiamientos") {
      const page = Math.max(1, Math.min(100_000, Number.parseInt(query.page ?? "1", 10) || 1));
      const pageSize = 50;
      const loans = await db.from("loans").select("id,customer_id,device_id,contract_id,status,sale_price,principal,down_payment,installment_count,created_at", { count: "exact" }).eq("tenant_id", tenantId).order("created_at", { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1);
      const visibleLoans = loans.data ?? [];
      const [customers, devices, contracts] = await Promise.all([
        visibleLoans.length ? db.from("customers").select("id,full_name").eq("tenant_id", tenantId).in("id", [...new Set(visibleLoans.map((r) => r.customer_id))]) : Promise.resolve({ data: [], error: null }),
        visibleLoans.length ? db.from("devices").select("id,brand,model,imei").eq("tenant_id", tenantId).in("id", [...new Set(visibleLoans.map((r) => r.device_id))]) : Promise.resolve({ data: [], error: null }),
        visibleLoans.length ? db.from("credit_contracts").select("id,contract_number").eq("tenant_id", tenantId).in("id", [...new Set(visibleLoans.map((r) => r.contract_id))]) : Promise.resolve({ data: [], error: null }),
      ]);
      const names = new Map((customers.data ?? []).map((r) => [r.id, r.full_name])); const gear = new Map((devices.data ?? []).map((r) => [r.id, `${r.brand} ${r.model} · ${r.imei}`])); const nums = new Map((contracts.data ?? []).map((r) => [r.id, r.contract_number]));
      const rows = visibleLoans;
      const totalPages = Math.max(1, Math.ceil((loans.count ?? 0) / pageSize));
      const lookupError = customers.error || devices.error || contracts.error;
      content = loans.error || lookupError ? <Notice error message="No se pudo cargar la cartera de financiamientos." /> : <><Panel title={`Cartera · ${(loans.count ?? 0).toLocaleString("es-DO")} financiamientos`}><Table headers={["", "Cliente", "Contrato", "Equipo", "Estado", "Precio / principal", "Cuotas", "Estado de cuenta"]} rows={tableRows(rows, (r) => [<CustomerLabel key="customer" name={names.get(String(r.customer_id)) ?? "Cliente"}/>, <span key="contract" className="text-xs font-medium">{nums.get(String(r.contract_id)) ?? "—"}</span>, <span key="device" className="text-xs leading-5">{gear.get(String(r.device_id)) ?? "Equipo"}</span>, <StatusBadge key="status" status={String(r.status)} label={r.status === "approved" ? "Aprobado" : undefined}/>, <span key="money" className="km-amount block whitespace-nowrap text-xs"><b className="block text-[13px] font-semibold">{formatDop(String(r.sale_price))}</b><span className="mt-1 block text-muted">Capital {formatDop(String(r.principal))}</span></span>, String(r.installment_count), <Link href={`/financiamientos/${r.id}`} key={String(r.id)} className="inline-flex min-h-10 items-center whitespace-nowrap text-xs font-semibold text-accent hover:underline">Ver estado →</Link>])} empty="Todavía no hay financiamientos originados. Las solicitudes aprobadas se convertirán en créditos en el flujo de formalización." />{Boolean(loans.count) && <nav aria-label="Paginación de financiamientos" className="flex items-center justify-between border-t border-line px-5 py-3 text-xs"><Link aria-disabled={page<=1} className={page<=1?"pointer-events-none text-muted":"font-semibold text-accent"} href={`/financiamientos?page=${page-1}`}>Anterior</Link><span>Página {page} de {totalPages}</span><Link aria-disabled={page>=totalPages} className={page>=totalPages?"pointer-events-none text-muted":"font-semibold text-accent"} href={`/financiamientos?page=${page+1}`}>Siguiente</Link></nav>}</Panel></>;
    } else if (section === "cobros") {
      const recordAccess = await getTenantAccess("payments.record");
      const reverseAccess = await getTenantAccess("payments.reverse");
      const installmentPage = Math.max(1, Math.min(100_000, Number.parseInt(query.page ?? "1", 10) || 1));
      const paymentPage = Math.max(1, Math.min(100_000, Number.parseInt(query.paymentPage ?? "1", 10) || 1));
      const pageSize = 50;
      const [installmentResponse, payments, summary] = await Promise.all([
        db.rpc("tenant_open_installment_page", { p_tenant_id: tenantId, p_page: installmentPage, p_page_size: pageSize }),
        db.from("payments").select("id,loan_id,amount,received_at,payment_method,reference,reversed_at", { count: "exact" }).eq("tenant_id", tenantId).order("received_at", { ascending: false }).range((paymentPage - 1) * pageSize, paymentPage * pageSize - 1),
        db.rpc("tenant_collections_summary", { p_tenant_id: tenantId }),
      ]);
      const installmentResult = installmentResponse.data as unknown as { count: number; rows: Record<string, unknown>[] } | null;
      const open = installmentResult?.rows ?? [];
      const paymentRows = payments.data ?? [];
      const loanIds = [...new Set([...open.map((row) => String(row.loanId)), ...paymentRows.map((row) => String(row.loan_id))])];
      const loanResult = loanIds.length ? await db.from("loans").select("id,customer_id,status,branch_id").eq("tenant_id", tenantId).in("id", loanIds) : { data: [], error: null };
      const customerIds = [...new Set((loanResult.data ?? []).map((loan) => loan.customer_id))];
      const customerResult = customerIds.length ? await db.from("customers").select("id,full_name").eq("tenant_id", tenantId).in("id", customerIds) : { data: [], error: null };
      const loanMap = new Map((loanResult.data ?? []).map((loan) => [loan.id, loan]));
      const names = new Map((customerResult.data ?? []).map((customer) => [customer.id, customer.full_name]));
      const collectionStats = summary.data as unknown as Record<string, number | string> | null;
      const installmentTotal = installmentResult?.count ?? 0;
      const installmentPages = Math.max(1, Math.ceil(installmentTotal / pageSize));
      const paymentTotal = payments.count ?? 0;
      const paymentPages = Math.max(1, Math.ceil(paymentTotal / pageSize));
      const now = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santo_Domingo" }).format(new Date());
      const states: Record<string, string> = { registrado: "Pago guardado, distribuido a las cuotas más antiguas y asentado en el libro contable.", "exceeds-balance": "El monto supera el saldo pendiente del financiamiento.", invalid: "Revisa el monto y vuelve a intentar.", forbidden: "Tu rol no puede registrar pagos ni revertirlos.", "save-error": "No se pudo guardar el pago. Se conservaron los datos para reintentar.", revertido: "Pago revertido con asiento compensatorio; las cuotas fueron restauradas.", "reversal-invalid": "Escribe un motivo de al menos cinco caracteres.", "reversal-error": "No se pudo revertir. Verifica que el pago siga vigente." };
      const failed = installmentResponse.error || payments.error || summary.error || loanResult.error || customerResult.error;
      const pageHref = (nextInstallment: number, nextPayment: number) => { const params = new URLSearchParams(Object.entries(query).filter(([,v]) => typeof v === "string") as [string,string][]); params.set("page",String(nextInstallment)); params.set("paymentPage",String(nextPayment)); return `/cobros?${params}`; };
      content = failed ? <Notice error message="No se pudieron consultar las cuotas o los pagos." /> : <>
        {query.estado && states[query.estado] && <Notice error={!( ["registrado", "revertido"].includes(query.estado))} message={states[query.estado]} />}
        <nav aria-label="Accesos de cobros" className="mb-5 flex flex-wrap gap-2">
          <a href="#cuotas-por-cobrar" className="km-primary">{recordAccess.ok ? "Pagar una deuda" : "Ver deudas pendientes"}</a>
          <a href="#clientes-cobros" className="km-secondary">Estados de clientes</a>
          <Link href="/recibos" className="km-secondary">Ver todos los vouchers →</Link>
        </nav>
        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <div className="km-panel flex items-center gap-4 p-5"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent-soft text-accent"><ReceiptText size={20}/></span><div><p className="text-xs text-muted">Cuotas pendientes</p><p className="mt-1 text-2xl font-bold tabular-nums text-ink">{Number(collectionStats?.openInstallments ?? 0).toLocaleString("es-DO")}</p></div></div>
          <div className="km-panel flex items-center gap-4 p-5"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-warning-soft text-warning"><CalendarClock size={20}/></span><div><p className="text-xs text-muted">Cuotas vencidas</p><p className="mt-1 text-2xl font-bold tabular-nums text-ink">{Number(collectionStats?.overdueInstallments ?? 0).toLocaleString("es-DO")}</p></div></div>
          <div className="km-panel flex items-center gap-4 p-5"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-danger-soft text-danger"><CircleAlert size={20}/></span><div><p className="text-xs text-muted">Saldo vencido</p><p className="mt-1 text-2xl font-bold tabular-nums text-danger">{formatDop(String(collectionStats?.overdueBalance ?? 0))}</p></div></div>
        </div>
        <section id="cuotas-por-cobrar" aria-label="Deudas por cobrar" className="scroll-mt-24"><Panel title={"Cuotas por cobrar · " + installmentTotal.toLocaleString("es-DO")} description="Pulsa «Registrar pago» junto al cliente para abonar o saldar su financiamiento.">
          <Table collectionLayout="installment" headers={["", "Cliente", "Vencimiento", "Cuota", "Abonado", "Saldo pendiente", "Estado", "Acción"]} rows={tableRows(open, (r) => {
            const loan = loanMap.get(String(r.loanId));
            const dueCents = decimalToCents(String(r.amountDue)); const paidCents = decimalToCents(String(r.amountPaid)); const balanceCents = dueCents - paidCents;
            const balance = centsToDecimal(balanceCents); const loanBalance = centsToDecimal(decimalToCents(String(r.loanBalance ?? balance)));
            const customerName = String(r.customerName ?? names.get(String(r.customerId)) ?? "Cliente");
            return [<CustomerLabel key="customer" name={customerName}/>, <span key="date" className="whitespace-nowrap">{new Intl.DateTimeFormat("es-DO", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${r.dueDate}T00:00:00Z`))}</span>, <span key="due" className="whitespace-nowrap tabular-nums">{formatDopCents(dueCents)}</span>, <span key="paid" className="whitespace-nowrap tabular-nums text-muted">{formatDopCents(paidCents)}</span>, <b key="balance" className="whitespace-nowrap tabular-nums text-ink">{formatDopCents(balanceCents)}</b>, <StatusBadge key="status" status={String(r.dueDate) < now ? "overdue" : String(r.status)}/>, recordAccess.ok && r.loanStatus === "active" && loan?.status === "active" && (recordAccess.membership.role === "tenant_admin" || !recordAccess.membership.branch_id || recordAccess.membership.branch_id === loan.branch_id) ? <PaymentDialog customerName={customerName} dueDate={String(r.dueDate)} loanId={String(r.loanId)} balance={balance} paymentLimit={loanBalance} idempotencyKey={randomUUID()}/> : "—"];
          })} empty="Estás al día. No hay cuotas pendientes por cobrar." />
          {installmentTotal > 0 && <nav aria-label="Paginación de cuotas pendientes" className="flex items-center justify-between border-t border-line px-5 py-3 text-xs"><Link aria-disabled={installmentPage<=1} className={installmentPage<=1?"pointer-events-none text-muted":"font-semibold text-accent"} href={pageHref(Math.max(1,installmentPage-1),paymentPage)}>Anterior</Link><span>Página {installmentPage} de {installmentPages}</span><Link aria-disabled={installmentPage>=installmentPages} className={installmentPage>=installmentPages?"pointer-events-none text-muted":"font-semibold text-accent"} href={pageHref(Math.min(installmentPages,installmentPage+1),paymentPage)}>Siguiente</Link></nav>}
        </Panel>
        </section>
        <p className="mb-6 mt-3 text-xs leading-5 text-muted">Los pagos se aplican primero a las cuotas más antiguas. Los indicadores incluyen toda la cartera visible para tu usuario.</p>
        <CustomerCollectionsPanel access={access} query={query}/>
        <div className="mt-6"><Panel title={"Historial de pagos · " + paymentTotal.toLocaleString("es-DO")} description="Consulta tus comprobantes y los movimientos registrados.">
          <Table collectionLayout="payment" headers={["", "Fecha", "Cliente", "Monto", "Método y referencia", "Estado", "Comprobante"]} rows={tableRows(paymentRows, (r) => {
            const loan = loanMap.get(String(r.loan_id)); const customerName = names.get(String(loan?.customer_id)) ?? "Cliente";
            const methods: Record<string, string> = { cash: "Efectivo", bank_transfer: "Transferencia", card: "Tarjeta", other: "Otro" };
            return [new Intl.DateTimeFormat("es-DO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Santo_Domingo" }).format(new Date(String(r.received_at))), <CustomerLabel key="customer" name={customerName}/>, <b key="amount" className="whitespace-nowrap tabular-nums text-ink">{formatDop(String(r.amount))}</b>, <span key="method" className="block">{methods[String(r.payment_method)] ?? String(r.payment_method)}{r.reference ? <span className="mt-1 block break-words text-[11px] text-muted">{String(r.reference)}</span> : null}</span>, <StatusBadge key="status" status={r.reversed_at ? "reversed" : "registered"}/>, <div key={String(r.id)} className="flex items-center gap-3"><Link href={"/recibos/" + r.id} className="shrink-0 font-semibold text-accent hover:underline">Ver recibo</Link>{reverseAccess.ok && !r.reversed_at && (reverseAccess.membership.role === "tenant_admin" || !reverseAccess.membership.branch_id || reverseAccess.membership.branch_id === loan?.branch_id) ? <PaymentReversalDialog paymentId={String(r.id)} customerName={customerName}/> : null}</div>];
          })} empty="Aquí aparecerá el historial cuando registres tu primer pago." />
          {paymentTotal > 0 && <nav aria-label="Paginación de pagos" className="flex items-center justify-between border-t border-line px-5 py-3 text-xs"><Link aria-disabled={paymentPage<=1} className={paymentPage<=1?"pointer-events-none text-muted":"font-semibold text-accent"} href={pageHref(installmentPage,Math.max(1,paymentPage-1))}>Anterior</Link><span>Página {paymentPage} de {paymentPages}</span><Link aria-disabled={paymentPage>=paymentPages} className={paymentPage>=paymentPages?"pointer-events-none text-muted":"font-semibold text-accent"} href={pageHref(installmentPage,Math.min(paymentPages,paymentPage+1))}>Siguiente</Link></nav>}
        </Panel></div>
      </>;
    } else if (section === "mdm") {
      const commandPage = Math.max(1, Math.min(100_000, Number.parseInt(query.commandPage ?? "1", 10) || 1));
      const pageSize = 50;
      const { data: commands, error: ce, count: commandCount } = await db.from("mdm_commands")
        .select("id,device_id,command_type,status,created_at", { count: "exact" })
        .eq("tenant_id", tenantId).order("created_at", { ascending: false })
        .range((commandPage - 1) * pageSize, commandPage * pageSize - 1);
      const commandDeviceIds = [...new Set((commands ?? []).map((r) => r.device_id))];
      const commandDevices = commandDeviceIds.length ? await db.from("devices").select("id,imei,brand,model").eq("tenant_id", tenantId).in("id", commandDeviceIds) : { data: [], error: null };
      const gear = new Map((commandDevices.data ?? []).map((r) => [r.id, `${r.brand} ${r.model} · ${r.imei}`]));
      const commandPages = Math.max(1, Math.ceil((commandCount ?? 0) / pageSize));
      const mdmHref = (page: number) => `/mdm?commandPage=${page}`;
      content = ce || commandDevices.error ? <Notice error message="No se pudo consultar el historial MDM." /> : <>
        <Notice message="MDM está desactivado por ahora. No hay proveedor conectado y la aplicación no enviará comandos ni registrará nuevas solicitudes. Este historial conserva únicamente registros anteriores." />
        <Panel title={`Historial MDM · ${(commandCount ?? 0).toLocaleString("es-DO")}`}>
          <Table headers={["", "Equipo", "Acción", "Estado", "Fecha"]} rows={tableRows(commands ?? [], (r) => [gear.get(String(r.device_id)) ?? "Equipo", String(r.command_type), String(r.status), new Intl.DateTimeFormat("es-DO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Santo_Domingo" }).format(new Date(String(r.created_at)))])} empty="No hay solicitudes MDM anteriores." />
          {Boolean(commandCount) && <nav aria-label="Paginación del historial MDM" className="flex items-center justify-between border-t border-line px-5 py-3 text-xs">
            <Link aria-disabled={commandPage <= 1} className={commandPage <= 1 ? "pointer-events-none text-muted" : "font-semibold text-accent"} href={mdmHref(Math.max(1, commandPage - 1))}>Anterior</Link>
            <span>Página {commandPage} de {commandPages}</span>
            <Link aria-disabled={commandPage >= commandPages} className={commandPage >= commandPages ? "pointer-events-none text-muted" : "font-semibold text-accent"} href={mdmHref(Math.min(commandPages, commandPage + 1))}>Siguiente</Link>
          </nav>}
        </Panel>
      </>;
    } else if (section === "sucursales") {
      const [{ data, error }, branchManageAccess] = await Promise.all([
        db.from("branches").select("id,name,code,active,created_at").eq("tenant_id", tenantId).order("created_at"),
        getTenantAccess("branches.manage"),
      ]);
      const canCreateBranch = branchManageAccess.ok && branchManageAccess.membership.role === "tenant_admin";
      const branchMessages: Record<string, string> = { creada: "Sucursal creada y registrada en la bitácora.", invalid: "Revisa el nombre y el código (2–20 caracteres alfanuméricos, guion o guion bajo).", duplicate: "Ese código ya existe en la empresa.", forbidden: "La creación de sucursales requiere el rol Administrador.", "save-error": "No se pudo guardar la sucursal." };
      content = error ? <Notice error message="No se pudieron cargar las sucursales." /> : <><Panel title="Sucursales registradas"><Table headers={["", "Nombre", "Código", "Estado"]} rows={tableRows(data ?? [], (r) => [String(r.name), String(r.code), r.active ? "Activa" : "Inactiva"])} empty="No se encontraron sucursales para esta empresa." /></Panel>{query.estado && branchMessages[query.estado] && <div className="mt-4"><Notice error={!(["creada"].includes(query.estado))} message={branchMessages[query.estado]} /></div>}{canCreateBranch ? <section className="km-panel mt-4 max-w-xl rounded-xl border border-line bg-surface p-5"><h2 className="text-sm font-bold text-ink">Crear sucursal</h2><p className="mt-1 text-xs leading-5 text-muted">La sucursal queda activa al crearse. No se borran ni trasladan registros históricos.</p><PreservedActionForm action={createTenantBranch} className="mt-4 grid gap-3 sm:grid-cols-[1fr_150px_auto] sm:items-end" messages={{invalid:"Revisa el nombre y el código.",duplicate:"Ese código ya existe en la empresa.",forbidden:"La creación de sucursales requiere el rol Administrador.","save-error":"No se pudo guardar; los campos se conservaron."}}><label className="text-xs font-semibold text-secondary">Nombre *<input required name="name" minLength={2} maxLength={120} className="km-input mt-1 block w-full rounded border border-field-border px-3 py-2 font-normal"/></label><label className="text-xs font-semibold text-secondary">Código *<input required name="code" minLength={2} maxLength={20} pattern="[A-Za-z0-9][A-Za-z0-9_-]{1,19}" className="km-input mt-1 block w-full rounded border border-field-border px-3 py-2 font-normal uppercase"/></label><SubmitButton className="km-primary rounded bg-brand px-3 py-2 text-xs font-semibold text-white">Crear</SubmitButton></PreservedActionForm></section> : <p className="mt-4 rounded-lg border border-accent-line bg-accent-soft p-3 text-xs leading-5 text-accent">Para crear sucursales, la cuenta debe tener alcance central de la empresa. La lectura y operación de datos se mantienen aisladas por sucursal.</p>}</>;
    } else if (section === "usuarios") {
      const page = Math.max(1, Math.min(100_000, Number.parseInt(query.page ?? "1", 10) || 1));
      const pageSize = 50;
      const [{ data, error, count }, { data: branches }] = await Promise.all([db.from("tenant_memberships").select("id,user_id,role,branch_id,status,created_at", { count: "exact" }).eq("tenant_id", tenantId).order("created_at", { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1), db.from("branches").select("id,name").eq("tenant_id", tenantId)]);
      const totalPages = Math.max(1, Math.ceil((count ?? 0) / pageSize));
      const roleOptions = [["tenant_admin","Administrador"],["branch_manager","Gerente de sucursal"],["sales","Ventas"],["cashier","Caja"],["collections","Cobros"],["auditor","Auditoría"]];
      content = error ? <Notice error message="No se pudieron consultar las membresías." /> : <><Notice message={`${(count ?? 0).toLocaleString("es-DO")} membresías. El Administrador puede consultar y operar en todas las sucursales, aunque tenga una sucursal de contexto. Los demás roles quedan limitados a la sucursal asignada. Las invitaciones por correo requieren configurar un proveedor de Auth.`}/><Panel title="Accesos de la empresa"><div className="divide-y divide-line">{(data ?? []).map((member) => <PreservedActionForm key={member.id} action={updateMembership} className="grid gap-3 p-4 sm:grid-cols-[minmax(120px,1fr)_150px_160px_130px_auto] sm:items-end" messages={{invalid:"Revisa el rol, sucursal y estado.","scope-required":"Solo Administrador puede quedar sin sucursal.",forbidden:"Tu rol no puede administrar usuarios.","save-error":"No se pudo guardar; los cambios quedaron en el formulario."}}><input type="hidden" name="membershipId" value={member.id}/><p className="text-xs text-secondary"><span className="block font-semibold">Cuenta {String(member.user_id).slice(0,8)}…</span><span className="text-muted">{String(member.user_id)}</span></p><label className="text-xs font-semibold text-secondary">Rol<select name="role" defaultValue={member.role} className="km-input mt-1 block w-full rounded border border-field-border bg-surface px-2 py-2 font-normal">{roleOptions.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label className="text-xs font-semibold text-secondary">Sucursal<select name="branchId" defaultValue={member.branch_id ?? ""} className="km-input mt-1 block w-full rounded border border-field-border bg-surface px-2 py-2 font-normal">{access.membership.role === "tenant_admin" && <option value="">Todas las sucursales</option>}{(branches ?? []).map((b)=><option key={b.id} value={b.id}>{b.name}</option>)}</select>{access.membership.role === "tenant_admin" && <span className="mt-1 block font-normal text-muted">El Administrador puede operar en toda la empresa; las operaciones de otros roles se limitan a su sucursal asignada.</span>}</label><label className="text-xs font-semibold text-secondary">Estado<select name="status" defaultValue={member.status} className="km-input mt-1 block w-full rounded border border-field-border bg-surface px-2 py-2 font-normal"><option value="active">Activo</option><option value="suspended">Suspendido</option></select></label><SubmitButton className="km-primary rounded bg-brand px-3 py-2 text-xs font-semibold text-white">Guardar</SubmitButton></PreservedActionForm>)}</div>{Boolean(count) && <nav aria-label="Paginación de usuarios" className="flex items-center justify-between border-t border-line px-5 py-3 text-xs"><Link aria-disabled={page <= 1} className={page <= 1 ? "pointer-events-none text-muted" : "font-semibold text-accent"} href={`/usuarios?page=${Math.max(1, page - 1)}`}>Anterior</Link><span>Página {page} de {totalPages}</span><Link aria-disabled={page >= totalPages} className={page >= totalPages ? "pointer-events-none text-muted" : "font-semibold text-accent"} href={`/usuarios?page=${Math.min(totalPages, page + 1)}`}>Siguiente</Link></nav>}</Panel>{query.estado && <Notice error={query.estado !== "actualizado"} message={query.estado === "actualizado" ? "Membresía actualizada y registrada en auditoría." : query.estado === "forbidden" ? "Tu rol no puede administrar usuarios." : query.estado === "scope-required" ? "Solo el rol Administrador puede quedar sin sucursal; asigna los demás roles a una sucursal." : "No se pudo guardar la membresía; verifica los datos."}/>}</>;
    } else if (section === "reportes") {
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santo_Domingo" }).format(new Date());
      const monthStart = `${today.slice(0, 7)}-01`;
      const validDate = (value?: string) => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00.000Z`)) && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value);
      const fromDate = validDate(query.from) ? query.from! : monthStart;
      const toDate = validDate(query.to) ? query.to! : today;
      const [{ data, error }, { data: reconciliation, error: reconciliationError }] = await Promise.all([
        db.rpc("tenant_report_summary", { p_tenant_id: tenantId, p_from_date: fromDate, p_to_date: toDate }),
        db.rpc("tenant_payment_reconciliation", { p_tenant_id: tenantId, p_from_date: fromDate, p_to_date: toDate }),
      ]);
      const report = data as unknown as Record<string, number | string> | null;
      const reconciliationReport = reconciliation as unknown as Record<string, number | string> | null;
      const metrics: [string, React.ReactNode][] = [
        ["Clientes", Number(report?.customers ?? 0)], ["Dispositivos", Number(report?.devices ?? 0)],
        ["Solicitudes en período", Number(report?.applications ?? 0)], ["Financiamientos activos", Number(report?.activeLoans ?? 0)],
        ["Saldo de cuotas del período", formatDop(String(report?.openReceivable ?? 0))], ["Pagos netos en período", formatDop(String(report?.paymentsReceived ?? 0))],
        ["Cuotas vencidas en período", Number(report?.overdueInstallments ?? 0)], ["Saldo vencido en período", formatDop(String(report?.overdueBalance ?? 0))],
      ];
      const exportUrl = `/api/reportes?from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}`;
      content = error || !report ? <Notice error message="No se pudieron calcular los reportes. Revisa el rango de fechas o tus permisos." /> : <>
        <form method="get" action="/reportes" className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface p-4">
          <label className="text-xs font-semibold text-secondary">Desde<input required type="date" name="from" defaultValue={fromDate} className="km-input mt-1 block rounded border border-field-border px-3 py-2 font-normal"/></label>
          <label className="text-xs font-semibold text-secondary">Hasta<input required type="date" name="to" defaultValue={toDate} className="km-input mt-1 block rounded border border-field-border px-3 py-2 font-normal"/></label>
          <SubmitButton className="km-primary rounded bg-brand px-4 py-2 text-xs font-semibold text-white">Aplicar filtro</SubmitButton>
          <a href={exportUrl} className="km-secondary">Descargar resumen CSV</a>
          <a href={`${exportUrl}&format=payments`} className="km-secondary">Descargar detalle de cobros</a>
          <a href={`${exportUrl}&format=reconciliation`} className="km-secondary">Descargar conciliación interna CSV</a>
          <span className="text-[11px] text-muted">Fechas de negocio: America/Santo_Domingo. Los conteos de clientes, equipos y préstamos activos son saldos actuales.</span>
        </form>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{metrics.map(([label, value]) => <div key={label} className="km-panel p-5"><p className="text-xs text-muted">{label}</p><p className="km-amount mt-3 text-2xl font-semibold text-ink">{value}</p></div>)}</div>
        <p className="mt-4 text-xs text-muted">Totales agregados en PostgreSQL bajo RLS; los pagos revertidos se excluyen de los cobros netos.</p>
        {reconciliationError || !reconciliationReport ? <div className="mt-5"><Notice error message="No se pudo verificar la conciliación interna con tu alcance de permisos actual." /></div> : <Panel title="Conciliación interna del libro de cobros"><div className="p-5">
          <p className="mb-4 text-xs leading-5 text-secondary">Compara pagos, distribuciones y asientos para las sucursales visibles a tu rol. No compara depósitos bancarios ni realiza cierre de caja. Los pagos de un período se comparan con todos sus asientos, incluidos reversos registrados después de la fecha del cobro.</p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[["Pagos verificados", Number(reconciliationReport.paymentCount ?? 0)], ["Neto esperado", formatDop(String(reconciliationReport.expectedLedgerNet ?? "0"))], ["Neto en libro", formatDop(String(reconciliationReport.actualLedgerNet ?? "0"))], ["Diferencia", formatDop(String(reconciliationReport.ledgerDifference ?? "0"))], ["Pagos con asiento distinto", Number(reconciliationReport.receiptMismatchCount ?? 0)], ["Distribuciones distintas", Number(reconciliationReport.allocationMismatchCount ?? 0)], ["Reversos distintos", Number(reconciliationReport.reversalMismatchCount ?? 0)]].map(([label,value])=><div key={String(label)} className="rounded-lg border border-line bg-subtle p-3"><p className="text-xs text-muted">{label}</p><p className="mt-1 text-lg font-bold text-ink">{value}</p></div>)}
          </div>
          {Number(reconciliationReport.receiptMismatchCount ?? 0)+Number(reconciliationReport.allocationMismatchCount ?? 0)+Number(reconciliationReport.reversalMismatchCount ?? 0)===0 && decimalToCents(String(reconciliationReport.ledgerDifference ?? "0"))===0n ? <p role="status" className="mt-4 rounded-lg border border-positive-line bg-positive-soft p-3 text-sm text-positive">Sin diferencias internas detectadas en el alcance visible para este período.</p> : <p role="alert" className="mt-4 rounded-lg border border-warning-line bg-warning-soft p-3 text-sm text-warning">Hay diferencias internas. Revisa el detalle de cobros y la bitácora antes de tomar acciones; este reporte no corrige registros automáticamente.</p>}
        </div></Panel>}</>;
    } else if (section === "auditoria") {
      const page = Math.max(1, Math.min(100_000, Number.parseInt(query.page ?? "1", 10) || 1));
      const pageSize = 50;
      const { data, error, count } = await db.from("audit_logs").select("id,actor_id,action,entity_type,entity_id,metadata,created_at", { count: "exact" }).eq("tenant_id", tenantId).order("created_at", { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1);
      const totalPages = Math.max(1, Math.ceil((count ?? 0) / pageSize));
      content = error ? <Notice error message="Tu rol no puede leer la bitácora o el servicio local no está disponible." /> : <><Notice message={`${(count ?? 0).toLocaleString("es-DO")} eventos de auditoría. La bitácora muestra solo las acciones que generan evento; no sustituye un informe de auditoría exportable.`}/><Panel title="Actividad registrada"><Table headers={["", "Fecha", "Acción", "Tipo", "Registro", "Actor"]} rows={tableRows(data ?? [], (r) => [new Intl.DateTimeFormat("es-DO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Santo_Domingo" }).format(new Date(String(r.created_at))), String(r.action), String(r.entity_type), String(r.entity_id ?? "—").slice(0, 8), String(r.actor_id).slice(0, 8) + "…"])} empty="Aún no hay eventos de auditoría registrados." />{Boolean(count) && <nav aria-label="Paginación de auditoría" className="flex items-center justify-between border-t border-line px-5 py-3 text-xs"><Link aria-disabled={page<=1} className={page<=1?"pointer-events-none text-muted":"font-semibold text-accent"} href={`/auditoria?page=${page-1}`}>Anterior</Link><span>Página {page} de {totalPages}</span><Link aria-disabled={page>=totalPages} className={page>=totalPages?"pointer-events-none text-muted":"font-semibold text-accent"} href={`/auditoria?page=${page+1}`}>Siguiente</Link></nav>}</Panel></>;
    }
  }
  return <div className="min-h-screen bg-canvas"><Sidebar/><Topbar/><main id="main-content" tabIndex={-1} className="km-main px-4 pb-10 pt-7 sm:px-7 lg:ml-[244px] lg:px-7"><div className="mb-6"><h1 className="km-page-title">{moduleConfig.title}</h1><p className="mt-1 text-sm text-muted">{moduleConfig.subtitle}</p></div>{content}<div className="mt-5"><Link href="/" className="text-xs font-semibold text-accent hover:underline">← Volver al dashboard</Link></div></main></div>;
}


