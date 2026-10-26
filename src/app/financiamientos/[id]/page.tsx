import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { StatusBadge } from "@/components/ui/status-badge";
import { PrintButton } from "@/components/print-button";
import { formatDop, formatDopCents, decimalToCents } from "@/lib/format-money";
import { getContractBreakdownBySequence } from "@/lib/contract-breakdown";
import { getTenantAccess } from "@/lib/security/tenant-access";

const businessDateTime = new Intl.DateTimeFormat("es-DO", {
  dateStyle: "medium", timeStyle: "short", timeZone: "America/Santo_Domingo",
});

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function optionalMoneyCents(value: unknown): bigint | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  try { return decimalToCents(value); } catch { return null; }
}

function quoteComponentCents(terms: unknown, topLevelKey: string, scheduleKey: string) {
  const snapshot = asRecord(terms);
  if (!snapshot) return null;
  const topLevel = optionalMoneyCents(snapshot[topLevelKey]);
  if (topLevel !== null) return topLevel;
  if (!Array.isArray(snapshot.schedule) || snapshot.schedule.length === 0) return null;
  let total = 0n;
  for (const rawRow of snapshot.schedule) {
    const amount = optionalMoneyCents(asRecord(rawRow)?.[scheduleKey]);
    if (amount === null) return null;
    total += amount;
  }
  return total;
}

export default async function LoanStatementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await getTenantAccess("financing.read");
  if (!access.ok) {
    if (access.reason === "unauthenticated") redirect("/login");
    notFound();
  }
  const tenantId = access.membership.tenant_id;
  const { data: loan, error: loanError } = await access.supabase.from("loans")
    .select("id,customer_id,contract_id,status,sale_price,down_payment,principal,installment_count,created_at")
    .eq("tenant_id", tenantId).eq("id", id).maybeSingle();
  if (loanError || !loan) notFound();

  const paymentRows = [];
  const pageSize = 200;
  let paymentError: unknown = null;
  for (let offset = 0; ; offset += pageSize) {
    const page = await access.supabase.from("payments")
      .select("id,amount,received_at,payment_method,reference,payment_type,reversed_at")
      .eq("tenant_id", tenantId).eq("loan_id", loan.id)
      .order("received_at", { ascending: true }).order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (page.error) {
      paymentError = page.error;
      break;
    }
    paymentRows.push(...(page.data ?? []));
    if ((page.data ?? []).length < pageSize) break;
  }
  const installmentRows = [];
  let installmentError: unknown = null;
  for (let offset = 0; ; offset += pageSize) {
    const page = await access.supabase.from("installments")
      .select("id,sequence,due_date,amount_due,amount_paid,status")
      .eq("tenant_id", tenantId).eq("loan_id", loan.id)
      .order("sequence", { ascending: true }).order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (page.error) {
      installmentError = page.error;
      break;
    }
    installmentRows.push(...(page.data ?? []));
    if ((page.data ?? []).length < pageSize) break;
  }

  const [customerResult, contractResult, installmentResult, paymentResult] = await Promise.all([
    access.supabase.from("customers").select("full_name,identity_number,phone").eq("tenant_id", tenantId).eq("id", loan.customer_id).maybeSingle(),
    access.supabase.from("credit_contracts").select("contract_number,terms").eq("tenant_id", tenantId).eq("id", loan.contract_id).maybeSingle(),
    Promise.resolve({ data: installmentRows, error: installmentError }),
    Promise.resolve({ data: paymentRows, error: paymentError }),
  ]);
  if (customerResult.error || contractResult.error || installmentResult.error || paymentResult.error || !customerResult.data || !contractResult.data) {
    return <main id="main-content" tabIndex={-1} className="mx-auto max-w-3xl p-5 sm:p-8"><Link href="/financiamientos" className="text-sm font-semibold text-accent">← Financiamientos</Link><p role="alert" className="mt-6 rounded-lg border border-warning-line bg-warning-soft p-4 text-sm text-warning">No se pudo cargar el estado de cuenta. Verifica tu acceso a la sucursal e inténtalo de nuevo.</p></main>;
  }

  const installments = installmentResult.data ?? [];
  const payments = paymentResult.data ?? [];
  const contractBreakdown = getContractBreakdownBySequence(contractResult.data.terms, installments);
  const totalScheduled = installments.reduce((sum, row) => sum + decimalToCents(row.amount_due), 0n);
  const totalAllocated = installments.reduce((sum, row) => sum + decimalToCents(row.amount_paid), 0n);
  const balance = totalScheduled - totalAllocated;
  const netReceived = payments.reduce((sum, row) => sum + (row.reversed_at ? 0n : decimalToCents(row.amount)), 0n);
  const initialReceived = payments.reduce((sum, row) => sum + (row.payment_type === "down_payment" && !row.reversed_at ? decimalToCents(row.amount) : 0n), 0n);
  const contractualInterest = quoteComponentCents(contractResult.data.terms, "baseInterest", "interest");
  const contractualExpenses = quoteComponentCents(contractResult.data.terms, "legalExpenses", "legalExpenses");
  const contractualAdjustment = quoteComponentCents(contractResult.data.terms, "proposedAdjustment", "proposedAdjustment");
  const movements = payments.flatMap((payment) => {
    const receipt = {
      id: `${payment.id}-received`, at: payment.received_at,
      label: payment.payment_type === "down_payment" ? "Pago inicial recibido" : "Pago recibido",
      amount: decimalToCents(payment.amount), method: payment.payment_method,
      reference: payment.reference, paymentId: payment.id, reversed: Boolean(payment.reversed_at),
    };
    return payment.reversed_at ? [receipt, {
      ...receipt, id: `${payment.id}-reversal`, at: payment.reversed_at,
      label: "Reverso compensatorio", amount: -decimalToCents(payment.amount), reversed: true,
    }] : [receipt];
  }).sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  const statusLabels: Record<string, string> = { draft: "Borrador", pending: "Pendiente", approved: "Aprobado", active: "Activo", paid_off: "Pagado", rejected: "Rechazado", cancelled: "Cancelado" };
  const installmentStatusLabels: Record<string, string> = { pending: "Pendiente", partial: "Parcial", paid: "Pagada", overdue: "Vencida", waived: "Exonerada" };
  const status = statusLabels[loan.status] ?? loan.status;

  const progress = totalScheduled > 0n ? Math.min(100, Math.max(0, Number(totalAllocated * 100n / totalScheduled))) : 0;
  const paidCount = installments.filter(row => row.status === "paid").length;
  const methodLabels: Record<string,string> = { cash: "Efectivo", bank_transfer: "Transferencia", card: "Tarjeta", other: "Otro", unspecified: "No especificado" };
  return <main id="main-content" tabIndex={-1} className="km-statement mx-auto min-h-screen max-w-6xl px-4 py-6 sm:px-8 sm:py-10">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
      <Link href="/financiamientos" className="text-sm font-semibold text-accent hover:text-accent">← Volver a financiamientos</Link>
      <PrintButton/>
    </div>
    <header className="mb-6 rounded-2xl bg-[#09203d] p-5 text-white sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-xs font-semibold uppercase tracking-[.14em] text-blue-200">KrediMax · Estado de cuenta</p><h1 className="mt-2 text-2xl font-bold">{customerResult.data.full_name}</h1><p className="mt-1 text-sm text-blue-100">Contrato {contractResult.data.contract_number}<span className="ml-3 inline-flex align-middle"><StatusBadge status={loan.status} label={status}/></span></p></div>
        <div className="rounded-lg border border-white/20 px-4 py-3 text-sm"><p className="text-blue-200">Saldo de cuotas</p><p className="mt-1 text-xl font-bold">{formatDopCents(balance)}</p></div>
      </div>
      <div className="mt-5 grid gap-3 text-sm sm:grid-cols-3"><p><span className="text-blue-200">Documento:</span> {customerResult.data.identity_number ?? "No registrado"}</p><p><span className="text-blue-200">Teléfono:</span> {customerResult.data.phone ?? "No registrado"}</p><p><span className="text-blue-200">Emisión:</span> {businessDateTime.format(new Date())}</p></div>
    </header>
    <section className="km-panel mb-6 p-5" aria-label="Avance de cuotas"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-sm font-bold">Avance de cuotas</h2><p className="mt-1.5 text-xs text-muted">{paidCount} de {installments.length} cuotas pagadas</p></div><p className="km-amount text-2xl font-bold text-accent">{progress}%</p></div><div role="progressbar" aria-label="Importe aplicado a cuotas" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} className="my-4 h-2.5 overflow-hidden rounded-full bg-soft"><div className="h-full rounded-full bg-blue-600" style={{width:`${progress}%`}}/></div><div className="flex flex-wrap justify-between gap-2 text-xs text-muted"><span>Aplicado: <b className="km-amount font-semibold text-secondary">{formatDopCents(totalAllocated)}</b></span><span>Programado: <b className="km-amount font-semibold text-secondary">{formatDopCents(totalScheduled)}</b></span></div></section>
    <section className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-5" aria-label="Resumen del financiamiento">
      {[
        ["Precio del equipo", formatDop(loan.sale_price)],
        ["Inicial acordado", formatDop(loan.down_payment)],
        ["Inicial recibido", formatDopCents(initialReceived)],
        ["Capital financiado", formatDop(loan.principal)],
        ["Total programado en cuotas", formatDopCents(totalScheduled)],
        ["Interés contractual", contractualInterest === null ? "No disponible" : formatDopCents(contractualInterest)],
        ["Gastos legales", contractualExpenses === null ? "No disponibles" : formatDopCents(contractualExpenses)],
        ["Ajuste contractual", contractualAdjustment === null ? "No disponible" : formatDopCents(contractualAdjustment)],
        ["Aplicado a cuotas", formatDopCents(totalAllocated)],
        ["Pagos netos recibidos", formatDopCents(netReceived)],
      ].map(([label, value]) => <div key={label} className="km-panel min-w-0 p-4"><p className="text-xs text-muted">{label}</p><p className="km-amount mt-2 break-words text-[17px] font-bold text-ink">{value}</p></div>)}
    </section>
    <section className="km-panel mb-6 overflow-hidden">
      <div className="border-b border-line px-4 py-4 sm:px-5"><h2 className="text-sm font-bold">Cronograma y saldo actual</h2><p className="mt-1 text-xs text-muted">Detalle de capital, intereses, gastos y saldo de cada cuota del contrato.</p></div>
      {installments.length ? <><div className="divide-y divide-line px-5 md:hidden print:hidden">{installments.map(row=>{const components=contractBreakdown.get(row.sequence);return <div key={row.id} className="py-4"><div className="flex items-center justify-between gap-3"><span className="text-sm font-bold">Cuota {row.sequence}</span><StatusBadge status={row.status} label={installmentStatusLabels[row.status] ?? row.status}/></div><p className="mt-2 text-xs text-muted">Vencimiento: {row.due_date}</p><dl className="mt-4 grid grid-cols-3 gap-3 text-xs">{[["Cuota total",formatDop(row.amount_due)],["Aplicado",formatDop(row.amount_paid)],["Saldo",formatDopCents(decimalToCents(row.amount_due)-decimalToCents(row.amount_paid))]].map(([label,value])=><div key={label}><dt className="text-muted">{label}</dt><dd className="km-amount mt-1 font-semibold">{value}</dd></div>)}</dl>{components && <details className="mt-4 text-xs text-muted"><summary className="cursor-pointer py-1 font-medium text-accent">Desglose de la cuota</summary><dl className="mt-2 grid grid-cols-2 gap-3">{([["Capital",components.principal],["Interés",components.interest],["Gastos",components.legalExpenses],["Ajuste",components.adjustment]] as const).map(([label,value])=><div key={String(label)}><dt>{String(label)}</dt><dd className="km-amount mt-1 text-secondary">{formatDopCents(value)}</dd></div>)}</dl></details>}</div>;})}</div><div className="hidden overflow-x-auto md:block print:block"><table className="km-table min-w-[1120px]"><thead className="bg-subtle text-muted"><tr>{["Cuota","Vencimiento","Capital","Interés","Gastos","Ajuste","Cuota total","Aplicado","Saldo","Estado"].map((label) => <th key={label} className="px-4 py-3 font-semibold">{label}</th>)}</tr></thead><tbody>{installments.map((row) => { const components = contractBreakdown.get(row.sequence); return <tr key={row.id} className="border-t border-line"><td className="px-4 py-3">{row.sequence}</td><td className="px-4 py-3">{row.due_date}</td><td className="px-4 py-3">{components ? formatDopCents(components.principal) : "—"}</td><td className="px-4 py-3">{components ? formatDopCents(components.interest) : "—"}</td><td className="px-4 py-3">{components ? formatDopCents(components.legalExpenses) : "—"}</td><td className="px-4 py-3">{components ? formatDopCents(components.adjustment) : "—"}</td><td className="px-4 py-3">{formatDop(row.amount_due)}</td><td className="px-4 py-3">{formatDop(row.amount_paid)}</td><td className="px-4 py-3 font-semibold">{formatDopCents(decimalToCents(row.amount_due) - decimalToCents(row.amount_paid))}</td><td className="px-4 py-3"><StatusBadge status={row.status} label={installmentStatusLabels[row.status] ?? row.status}/></td></tr>; })}</tbody></table></div></> : <p className="p-6 text-sm text-muted">Este financiamiento no tiene cuotas registradas.</p>}
    </section>
    <section className="km-panel overflow-hidden">
      <div className="border-b border-line px-4 py-4 sm:px-5"><h2 className="text-sm font-bold">Movimientos de pago</h2><p className="mt-1 text-xs text-muted">Los reversos se presentan como movimientos negativos y conservan el recibo original.</p></div>
      {movements.length ? <><div className="divide-y divide-line px-5 md:hidden print:hidden">{movements.map(row=><div key={row.id} className="py-4"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">{row.label}</p><p className="mt-1 text-xs text-muted">{businessDateTime.format(new Date(row.at))}</p></div><p className={`km-amount shrink-0 text-sm font-bold ${row.amount<0n ? "text-danger" : "text-ink"}`}>{formatDopCents(row.amount)}</p></div><p className="mt-3 break-words text-xs text-muted">{methodLabels[row.method] ?? row.method}{row.reference ? ` · ${row.reference}` : ""}</p><div className="mt-3 flex items-center justify-between"><StatusBadge status={row.reversed ? "reversed" : "registered"}/><Link href={`/recibos/${row.paymentId}`} className="inline-flex min-h-10 items-center text-xs font-semibold text-accent">Ver recibo →</Link></div></div>)}</div><div className="hidden overflow-x-auto md:block print:block"><table className="km-table min-w-[760px]"><thead className="bg-subtle text-muted"><tr>{["Fecha","Movimiento","Método / referencia","Importe","Estado","Comprobante"].map((label) => <th key={label} className="px-4 py-3 font-semibold">{label}</th>)}</tr></thead><tbody>{movements.map((row) => <tr key={row.id} className="border-t border-line"><td className="px-4 py-3">{businessDateTime.format(new Date(row.at))}</td><td className="px-4 py-3">{row.label}</td><td className="px-4 py-3">{methodLabels[row.method] ?? row.method}{row.reference ? ` · ${row.reference}` : ""}</td><td className={`px-4 py-3 font-semibold ${row.amount < 0n ? "text-danger" : "text-ink"}`}>{formatDopCents(row.amount)}</td><td className="px-4 py-3"><StatusBadge status={row.reversed ? "reversed" : "registered"} label={row.id.endsWith("-reversal") ? "Reversado" : row.reversed ? "Revertido" : "Registrado"}/></td><td className="px-4 py-3"><Link href={`/recibos/${row.paymentId}`} className="font-semibold text-accent underline">Ver recibo</Link></td></tr>)}</tbody></table></div></> : <p className="p-6 text-sm text-muted">Todavía no hay pagos registrados.</p>}
    </section>
  </main>;
}
