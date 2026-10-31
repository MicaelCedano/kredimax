import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { PrintButton } from "@/components/print-button";
import { formatDop } from "@/lib/format-money";
import { getTenantAccess } from "@/lib/security/tenant-access";
import type { CashRow } from "@/modules/cash/types";

type Movement = { id: string; at: string; kind: string; amount: string; paymentId: string; receipt: string | null; method: string; reference: string | null; customer: string; contract: string; loanId: string };
type Result = { count: number; total: string; rows: Movement[] };
const dateTime = new Intl.DateTimeFormat("es-DO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Santo_Domingo" });
const methods: Record<string, string> = { cash: "Efectivo", bank_transfer: "Transferencia", card: "Tarjeta", other: "Otro", unspecified: "No especificado" };

export default async function CashMovementsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [query, access] = await Promise.all([searchParams, getTenantAccess("cash.read")]);
  if (!access.ok) { if (access.reason === "unauthenticated") redirect("/login"); notFound(); }
  const parsed = z.object({ dia: z.iso.date(), vendedor: z.uuid(), sucursal: z.uuid(), tipo: z.enum(["down_payment", "installment"]), pagina: z.coerce.number().int().min(1).max(100000).default(1) }).safeParse(query);
  if (!parsed.success) notFound();
  const filter = parsed.data;
  const [movements, report] = await Promise.all([
    access.supabase.rpc("cash_day_movements", { p_tenant_id: access.membership.tenant_id, p_branch_id: filter.sucursal, p_seller_id: filter.vendedor, p_day: filter.dia, p_type: filter.tipo, p_page: filter.pagina }),
    access.supabase.rpc("cash_day_report", { p_tenant_id: access.membership.tenant_id, p_day: filter.dia }),
  ]);
  const row = (report.data as CashRow[] | null)?.find(row => row.sellerId === filter.vendedor && row.branchId === filter.sucursal && row.type === filter.tipo);
  const result = movements.data as Result | null;
  const href = (page: number) => `/cajas/movimientos?${new URLSearchParams({ dia: filter.dia, vendedor: filter.vendedor, sucursal: filter.sucursal, tipo: filter.tipo, pagina: String(page) })}`;
  return <div className="min-h-screen bg-canvas"><Sidebar/><Topbar/><main id="main-content" tabIndex={-1} className="km-main px-4 sm:px-7 lg:ml-[244px]">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden"><Link href={`/cajas?dia=${filter.dia}&vendedor=${filter.vendedor}`} className="text-sm font-medium text-accent">← Volver al cuadre</Link><PrintButton/></div>
    <h1 className="text-2xl font-semibold">Movimientos de caja · {filter.tipo === "down_payment" ? "Iniciales" : "Cuotas recurrentes"}</h1>
    <p className="mb-6 mt-2 text-sm text-muted">{row?.sellerName ?? "Caja"} · {row?.branchName ?? "Sucursal"} · {filter.dia}</p>
    {movements.error || report.error || !result || !row ? <p role="alert" className="km-panel p-5 text-danger">No se pudo consultar esta caja con tu sesión y alcance actuales.</p> : <section className="km-panel overflow-hidden">
      <p className="border-b border-line p-5 text-sm">{result.count} movimientos · Total neto del día: <b className="km-amount">{formatDop(result.total)}</b></p>
      <div className="overflow-x-auto"><table className="km-table text-left text-xs"><thead><tr>{["Fecha / movimiento", "Cliente / financiamiento", "Comprobante", "Método / referencia", "Importe"].map(label => <th key={label} className="px-5 py-3">{label}</th>)}</tr></thead><tbody>{result.rows.map(movement => <tr key={movement.id} className="border-t border-line">
        <td className="px-5 py-4">{dateTime.format(new Date(movement.at))}<span className="mt-1 block text-muted">{movement.kind === "payment_reversal" ? "Reverso" : "Cobro recibido"}</span></td>
        <td className="px-5 py-4">{movement.customer}<Link href={`/financiamientos/${movement.loanId}`} className="mt-1 block font-medium text-accent">{movement.contract}</Link></td>
        <td className="px-5 py-4"><Link className="font-mono font-medium text-accent" href={`/recibos/${movement.paymentId}`}>{movement.receipt ?? movement.paymentId}</Link></td>
        <td className="px-5 py-4">{methods[movement.method] ?? movement.method}<span className="mt-1 block text-muted">{movement.reference ?? "Sin referencia"}</span></td>
        <td className="km-amount px-5 py-4 font-semibold">{formatDop(movement.amount)}</td>
      </tr>)}</tbody></table></div>
      {!result.rows.length && <p className="p-5 text-sm text-muted">No hay movimientos en esta página.</p>}
      <nav aria-label="Paginación de movimientos" className="flex items-center justify-between border-t border-line p-5 text-xs print:hidden">
        {filter.pagina > 1 ? <Link className="text-accent" href={href(filter.pagina - 1)}>Anterior</Link> : <span>Anterior</span>}<span>Página {filter.pagina} de {Math.max(1, Math.ceil(result.count / 25))}</span>
        {filter.pagina * 25 < result.count ? <Link className="text-accent" href={href(filter.pagina + 1)}>Siguiente</Link> : <span>Siguiente</span>}
      </nav><p className="border-t border-line p-5 text-xs text-muted">El total incluye todas las páginas. Los reversos se muestran en la fecha en que se registraron. Fecha y hora de República Dominicana.</p>
    </section>}
  </main></div>;
}
