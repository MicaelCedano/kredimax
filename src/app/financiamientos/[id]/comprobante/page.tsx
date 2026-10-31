import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { PrintButton } from "@/components/print-button";
import { formatDop, decimalToCents } from "@/lib/format-money";
import { getTenantAccess } from "@/lib/security/tenant-access";

const methods = { cash: "Efectivo", bank_transfer: "Transferencia", card: "Tarjeta", other: "Otro" };
const dateTime = new Intl.DateTimeFormat("es-DO", { dateStyle: "long", timeStyle: "short", timeZone: "America/Santo_Domingo" });

export default async function UnsavedReceiptPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ id }, query, access] = await Promise.all([params, searchParams, getTenantAccess("payments.record")]);
  if (!access.ok) { if (access.reason === "unauthenticated") redirect("/login"); notFound(); }
  const parsed = z.object({ tipo: z.enum(["down_payment", "installment"]), metodo: z.enum(["cash", "bank_transfer", "card", "other"]),
    monto: z.string().regex(/^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/), control: z.uuid() }).safeParse(query);
  if (!parsed.success || !z.uuid().safeParse(id).success) notFound();
  const data = parsed.data, tenant = access.membership.tenant_id;
  const loanResult = await access.supabase.from("loans").select("id,customer_id,contract_id,down_payment,status,branch_id").eq("tenant_id", tenant).eq("id", id).maybeSingle();
  const loan = loanResult.data;
  if (loanResult.error || !loan || (data.tipo === "down_payment" ? loan.status !== "approved" : !["active", "paid_off"].includes(loan.status))) notFound();
  const [customer, contract, company, installments] = await Promise.all([
    access.supabase.from("customers").select("full_name,identity_number").eq("tenant_id", tenant).eq("id", loan.customer_id).maybeSingle(),
    access.supabase.from("credit_contracts").select("contract_number").eq("tenant_id", tenant).eq("id", loan.contract_id).maybeSingle(),
    access.supabase.from("tenants").select("name").eq("id", tenant).maybeSingle(),
    access.supabase.from("installments").select("amount_due,amount_paid,status").eq("tenant_id", tenant).eq("loan_id", id),
  ]);
  if (customer.error || contract.error || company.error || installments.error || !customer.data || !contract.data || !company.data) notFound();
  const amount = data.tipo === "down_payment" ? String(loan.down_payment) : data.monto;
  const balance = (installments.data ?? []).filter(row => row.status !== "waived").reduce((sum, row) => sum + decimalToCents(row.amount_due) - decimalToCents(row.amount_paid), 0n);
  if (decimalToCents(amount) <= 0n || (data.tipo === "installment" && decimalToCents(amount) > balance)) notFound();
  return <main id="main-content" tabIndex={-1} className="mx-auto max-w-3xl p-5 sm:p-8">
    <div className="mb-5 flex justify-end print:hidden"><PrintButton/></div>
    <article className="km-document km-panel p-6 sm:p-10"><header className="border-b border-line pb-5"><p className="text-2xl font-semibold">KrediMax · {company.data.name}</p><h1 className="mt-6 text-xl font-semibold">Formato de pago para firma</h1><p className="mt-2 text-sm text-muted">{data.tipo === "down_payment" ? "Pago inicial" : "Pago de cuotas"} · Pendiente de registro</p></header>
      <dl className="mt-6 grid gap-5 text-sm sm:grid-cols-2">{[["Cliente", customer.data.full_name], ["Documento", customer.data.identity_number ?? "Sin documento"], ["Financiamiento", contract.data.contract_number], ["Método", methods[data.metodo]], ["Monto", formatDop(amount)], ["Formato preparado el", dateTime.format(new Date())]].map(([label, value]) => <div key={label}><dt className="text-xs text-muted">{label}</dt><dd className="mt-2 font-semibold">{value}</dd></div>)}</dl>
      <p className="mt-6 text-sm leading-7">El cliente firma en constancia del importe y método indicados. Fecha de entrega del dinero: __________________. Referencia bancaria, si aplica: __________________.</p>
      <div className="mt-20 grid grid-cols-2 gap-8 text-center text-sm"><div className="border-t border-field-border pt-3">Firma del cliente</div><div className="border-t border-field-border pt-3">Firma de quien recibe</div></div>
      <footer className="mt-12 border-t border-dashed border-line pt-5 text-xs leading-6 text-muted"><p>Adjunta la foto de este formato firmado al registrar el pago. La impresión no registra dinero en caja. El recibo numerado se genera automáticamente cuando se guarda el pago.</p><p className="mt-2 break-all font-mono">Control del envío: {data.control}</p></footer>
    </article>
  </main>;
}
