import Link from "next/link";
import { ChevronDown, HelpCircle } from "lucide-react";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { PrintButton } from "@/components/print-button";
import { EmptyState } from "@/components/ui/empty-state";
import { getTenantAccess } from "@/lib/security/tenant-access";
import { isoDateInTimeZone } from "@/lib/business-date";
import { CashDaySummary } from "@/modules/cash/day-summary";
import { SellerCashCard } from "@/modules/cash/seller-cash-card";
import { groupCashRows } from "@/modules/cash/summary";
import type { CashRow } from "@/modules/cash/types";
import "./cash.css";

export default async function CashPage({ searchParams }: { searchParams: Promise<{ dia?: string; vendedor?: string }> }) {
  const [query, access, closingAccess] = await Promise.all([searchParams, getTenantAccess("cash.read"), getTenantAccess("cash.close")]);
  if (!access.ok && access.reason === "unauthenticated") redirect("/login");
  const today = isoDateInTimeZone(new Date());
  const day = query.dia ?? today;
  const valid = z.iso.date().safeParse(day).success && (!query.vendedor || z.uuid().safeParse(query.vendedor).success);
  const result = access.ok && valid ? await access.supabase.rpc("cash_day_report", { p_tenant_id: access.membership.tenant_id, p_day: day }) : null;
  const allRows = (result?.data ?? []) as CashRow[];
  const rows = query.vendedor ? allRows.filter(row => row.sellerId === query.vendedor) : allRows;
  const sellers = [...new Map(allRows.map(row => [row.sellerId, row.sellerName])).entries()];
  const groups = groupCashRows(rows);
  const hasError = !access.ok || !valid || result?.error || !result?.data;
  const canClose = closingAccess.ok && access.ok && closingAccess.membership.tenant_id === access.membership.tenant_id && day <= today;
  const ownDrawer = access.ok && ["sales", "cashier", "collections"].includes(access.membership.role);
  return <div className="min-h-screen bg-canvas"><Sidebar/><Topbar/>
    <main id="main-content" tabIndex={-1} className="cash-workspace km-main px-4 sm:px-7 lg:ml-[244px]">
      <header className="cash-page-header"><div><h1 className="km-page-title">Cajas y cuadres</h1><p>Revisa lo cobrado y confirma la entrega de cada vendedor.</p></div><PrintButton label="Imprimir cuadre" className="km-secondary"/></header>
      <form className="cash-filters km-panel print:hidden">
        <label>Fecha del cuadre<input className="km-input" type="date" name="dia" defaultValue={day} required/></label>
        <label>Vendedor<select className="km-input" name="vendedor" defaultValue={query.vendedor ?? ""}><option value="">{ownDrawer ? "Mi caja" : "Todos los vendedores"}</option>{sellers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        <button className="km-primary">Consultar</button><Link className="km-secondary" href="/recibos">Ver recibos</Link>
      </form>
      <p className="cash-print-date">Fecha del cuadre: {day} · Hora de República Dominicana</p>
      {hasError ? <p role="alert" className="km-panel p-5 text-danger">{!valid ? "Selecciona una fecha y un vendedor válidos." : "No se pudieron cargar las cajas. Revisa tu sesión y vuelve a intentarlo."}</p> : <>
        <CashDaySummary rows={rows}/>
        <section className="cash-sellers" aria-labelledby="cash-sellers-title">
          <header className="cash-section-header"><h2 id="cash-sellers-title">Cajas por vendedor</h2><p>Cada vendedor cierra sus iniciales y sus cuotas por separado.</p></header>
          {groups.length ? <div className="cash-seller-list">{groups.map(group => <SellerCashCard key={group.key} group={group} day={day} canClose={canClose}/>)}</div>
            : <div className="km-panel"><EmptyState title="No hay cajas para esta selección" description="Prueba otra fecha o selecciona todos los vendedores." href="/cajas" action="Ver cajas de hoy"/></div>}
        </section>
        <details className="cash-help km-panel print:hidden"><summary><HelpCircle size={16} aria-hidden/><span>Cómo funciona el cuadre</span><ChevronDown size={16} className="cash-help-chevron" aria-hidden/></summary>
          <div className="cash-help-content"><ol><li><b>Revisa los cobros.</b> Los iniciales se registran al entregar equipos; las cuotas son los abonos posteriores.</li><li><b>Cuenta y verifica.</b> Compara el efectivo que entrega el vendedor y las transferencias confirmadas con lo esperado.</li><li><b>Guarda cada cierre.</b> Si hay diferencias por método, explica el motivo. La caja queda cuadrada cuando todos los importes coinciden.</li></ol><p>La fecha corresponde al día real del cobro, en hora de República Dominicana. Los reversos restan en el día en que se registran, en la caja de quien recibió el pago original.</p><p>Un cierre guardado no acepta nuevos movimientos para ese vendedor, fecha y tipo de cobro. El total del día incluye los reversos; «Otros» agrupa tarjetas y métodos históricos.</p></div>
        </details>
      </>}
    </main>
  </div>;
}
