import Link from "next/link";
import { Check, ReceiptText, RotateCcw } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { formatDop } from "@/lib/format-money";
import { getTenantAccess } from "@/lib/security/tenant-access";

const dateTime = new Intl.DateTimeFormat("es-DO", { dateStyle: "long", timeStyle: "short", timeZone: "America/Santo_Domingo" });
const methodLabels: Record<string, string> = { cash: "Efectivo", bank_transfer: "Transferencia bancaria", card: "Tarjeta", other: "Otro", unspecified: "No especificado" };

export default async function PaymentReceiptPage({ params }: { params: Promise<{ paymentId: string }> }) {
  const { paymentId } = await params;
  const access = await getTenantAccess("payments.read");
  if (!access.ok) {
    if (access.reason === "unauthenticated") redirect("/login");
    notFound();
  }
  const tenantId = access.membership.tenant_id;
  const { data: payment, error: paymentError } = await access.supabase.from("payments")
    .select("id,receipt_number,loan_id,amount,currency,received_at,payment_method,reference,payment_type,reversed_at,reversal_reason")
    .eq("tenant_id", tenantId).eq("id", paymentId).maybeSingle();
  if (paymentError || !payment) notFound();

  const [loanResult, allocationResult, evidenceResult] = await Promise.all([
    access.supabase.from("loans").select("id,customer_id,contract_id,status").eq("tenant_id", tenantId).eq("id", payment.loan_id).maybeSingle(),
    access.supabase.from("payment_allocations").select("installment_id,amount").eq("tenant_id", tenantId).eq("payment_id", payment.id),
    access.supabase.from("payment_evidence").select("evidence_kind,created_at").eq("tenant_id", tenantId).eq("payment_id", payment.id).maybeSingle(),
  ]);
  if (loanResult.error || allocationResult.error || !loanResult.data) {
    return <main id="main-content" tabIndex={-1} className="mx-auto max-w-2xl p-5 sm:p-8"><p role="alert" className="rounded-lg border border-warning-line bg-warning-soft p-4 text-sm text-warning">No se pudo consultar el comprobante. Verifica el alcance de tu sucursal.</p></main>;
  }
  const allocations = allocationResult.data ?? [];
  const installmentIds = allocations.map((row) => row.installment_id);
  const [customerResult, contractResult, installmentResult] = await Promise.all([
    access.supabase.from("customers").select("full_name,identity_number,phone").eq("tenant_id", tenantId).eq("id", loanResult.data.customer_id).maybeSingle(),
    access.supabase.from("credit_contracts").select("contract_number").eq("tenant_id", tenantId).eq("id", loanResult.data.contract_id).maybeSingle(),
    installmentIds.length
      ? access.supabase.from("installments").select("id,sequence,due_date").eq("tenant_id", tenantId).in("id", installmentIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (customerResult.error || contractResult.error || installmentResult.error || !customerResult.data || !contractResult.data) {
    return <main id="main-content" tabIndex={-1} className="mx-auto max-w-2xl p-5 sm:p-8"><p role="alert" className="rounded-lg border border-warning-line bg-warning-soft p-4 text-sm text-warning">No se pudo cargar el detalle del comprobante.</p></main>;
  }
  const installments = new Map((installmentResult.data ?? []).map((row) => [row.id, row]));
  const isReversed = Boolean(payment.reversed_at);
  const paymentType = payment.payment_type === "down_payment" ? "Pago inicial" : "Pago de cuota";

  return <main id="main-content" tabIndex={-1} className="mx-auto min-h-screen max-w-3xl px-4 py-6 sm:px-8 sm:py-10">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden"><div className="flex flex-wrap gap-4"><Link href="/recibos" className="text-sm font-semibold text-accent">← Todos los vouchers</Link><Link href={`/financiamientos/${loanResult.data.id}`} className="text-sm font-semibold text-accent">← Estado de cuenta</Link></div><PrintButton/></div>
    <article className="km-document km-panel overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-4 border-b border-line px-5 py-5 sm:px-8"><p className="text-[25px] font-bold tracking-[-1px] text-ink">Kredi<span className="text-accent">Max</span></p><span className="flex items-center gap-2 text-xs text-muted"><ReceiptText size={16} aria-hidden/>Comprobante de pago</span></div><div className="p-5 sm:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
        <div><h1 className="text-2xl font-bold tracking-tight text-ink">{isReversed ? "Recibo revertido" : "Recibo de pago"}</h1><p className="mt-1 font-mono text-sm font-semibold">{payment.receipt_number ?? `Histórico · ${payment.id}`}</p><p className="mt-1 text-sm text-muted">{paymentType} · Financiamiento {contractResult.data.contract_number}</p></div>
        <div className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-[11px] font-semibold ${isReversed ? "bg-danger-soft text-danger" : "bg-positive-soft text-positive"}`}>{isReversed ? <RotateCcw size={13} aria-hidden/> : <Check size={13} aria-hidden/>}{isReversed ? "REVERSADO" : "REGISTRADO"}</div>
      </header>
      <section aria-label="Monto del comprobante" className={`mt-6 rounded-xl border p-5 sm:p-6 ${isReversed ? "border-danger-line bg-danger-soft" : "border-accent-line bg-accent-soft/60"}`}><p className="text-xs font-medium text-muted">{isReversed ? "Monto original revertido" : "Monto recibido"}</p><p className="km-amount mt-2 break-words text-[32px] font-bold tracking-tight text-ink sm:text-[38px]">{formatDop(payment.amount)} <span className="text-sm font-medium text-muted">{payment.currency}</span></p></section>
      <dl className="grid gap-x-6 gap-y-4 border-b border-line py-5 text-sm sm:grid-cols-2">
        <div><dt className="text-xs text-muted">Cliente</dt><dd className="mt-1 font-semibold text-ink">{customerResult.data.full_name}</dd></div>
        <div><dt className="text-xs text-muted">Documento</dt><dd className="mt-1 font-medium">{customerResult.data.identity_number ?? "No registrado"}</dd></div>
        <div><dt className="text-xs text-muted">Fecha de recepción</dt><dd className="mt-1 font-medium">{dateTime.format(new Date(payment.received_at))}</dd></div>
        <div><dt className="text-xs text-muted">Método</dt><dd className="mt-1 font-medium">{methodLabels[payment.payment_method] ?? payment.payment_method}</dd></div>
        <div><dt className="text-xs text-muted">Referencia</dt><dd className="mt-1 font-medium">{payment.reference ?? "Sin referencia"}</dd></div>
        <div><dt className="text-xs text-muted">Folio</dt><dd className="mt-1 break-all font-mono text-xs">{payment.id}</dd></div>
      </dl>
      <section className="py-5"><h2 className="text-sm font-bold text-ink">{isReversed ? "Distribución original del pago" : "Aplicación del pago"}</h2>
        {allocations.length ? <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-xs sm:text-sm"><thead className="bg-subtle text-muted"><tr><th className="px-3 py-2.5">Cuota</th><th className="px-3 py-2.5">Vencimiento</th><th className="px-3 py-2.5 text-right">Aplicado</th></tr></thead><tbody>{allocations.map((row) => { const installment = installments.get(row.installment_id); return <tr key={row.installment_id} className="border-t border-line"><td className="px-3 py-3">{installment?.sequence ?? "—"}</td><td className="px-3 py-3">{installment?.due_date ?? "—"}</td><td className="px-3 py-3 text-right font-semibold">{formatDop(row.amount)}</td></tr>; })}</tbody></table></div> : <p className="mt-2 rounded-lg bg-subtle p-3 text-xs text-secondary">Pago inicial registrado fuera del cronograma de cuotas.</p>}
      </section>
      
      {!isReversed && <section aria-label="Firmas del comprobante" className="mb-6 mt-16 grid grid-cols-2 gap-8 text-center text-xs"><div className="border-t border-field-border pt-3">Firma del cliente<p className="mt-2 text-muted">{customerResult.data.full_name}</p></div><div className="border-t border-field-border pt-3">Firma de quien recibe<p className="mt-2 text-muted">Fecha: __________________</p></div></section>}
      <section className="mt-4 border-t border-line pt-5 print:hidden"><h2 className="text-sm font-bold">Evidencia del pago</h2>
        {evidenceResult.error ? <p role="alert" className="mt-2 text-sm text-danger">No se pudo cargar la evidencia. Vuelve a intentarlo.</p> : evidenceResult.data ? <>
          <p className="mt-2 text-xs text-muted">{evidenceResult.data.evidence_kind === "signed_cash_receipt" ? "Recibo firmado por el cliente" : evidenceResult.data.evidence_kind === "bank_transfer_voucher" ? "Voucher de transferencia" : "Comprobante adjunto"} · Guardado el {dateTime.format(new Date(evidenceResult.data.created_at))}</p>
          <a href={`/api/recibos/${payment.id}/evidencia`} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-xs font-semibold text-accent print:hidden">Abrir imagen completa</a>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/recibos/${payment.id}/evidencia`} alt="Evidencia adjunta al pago" className="mt-3 max-h-[700px] w-full rounded-lg border border-line object-contain print:max-h-[500px]"/>
        </> : <p className="mt-2 text-xs text-muted">Este comprobante no tiene evidencia adjunta. Los pagos históricos se conservan tal como fueron registrados.</p>}
      </section>
      {isReversed && <section className="mt-5 rounded-lg border border-danger-line bg-danger-soft p-4 text-sm text-danger"><h2 className="font-bold">Reverso compensatorio</h2><p className="mt-1">Fecha: {dateTime.format(new Date(payment.reversed_at!))}</p><p className="mt-1">Motivo: {payment.reversal_reason || "Motivo registrado en la auditoría financiera."}</p><p className="mt-2 text-xs">Este comprobante conserva el registro original; el importe no cuenta como cobro neto.</p></section>}
      <footer className="mt-6 border-t border-dashed border-field-border pt-4 text-xs leading-5 text-muted"><p>Documento generado desde el registro de pagos de KrediMax. El estado y el saldo actual pueden consultarse en el estado de cuenta del financiamiento.</p><p className="mt-1 break-all">Préstamo: {loanResult.data.id}</p></footer></div>
    </article>
  </main>;
}
