import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { getTenantAccess } from "@/lib/security/tenant-access";
import { formatDop } from "@/lib/format-money";
import { loadHandoverContext } from "@/modules/financing/handover-context.server";
import clauses from "@/modules/financing/contract-clauses.json";

export const metadata = { title: "Borrador de contrato | KrediMax", robots: { index: false, follow: false } };

export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await getTenantAccess("financing.read");
  if (!access.ok) { if (access.reason === "unauthenticated") redirect("/login"); notFound(); }
  const context = await loadHandoverContext(id, access);
  if (!context) notFound();
  const { customer, loan, contract, quote, company } = context;
  const field = (value?: string | null) => value?.trim() || "[POR COMPLETAR]";
  const money = (value?: string) => value != null ? formatDop(value) : "[POR COMPLETAR]";
  const frequency = quote.frequency === "fortnightly" ? "quincenal" : quote.frequency === "monthly" ? "mensual" : "[POR COMPLETAR]";
  const rows = [
    ["Precio de contado", formatDop(loan.sale_price)], ["Inicial", formatDop(loan.down_payment)], ["Capital financiado", formatDop(loan.principal)],
    ["Tasa anual simple", quote.annualRatePercent != null ? `${quote.annualRatePercent}%` : "[POR COMPLETAR]"], ["Interés del plazo", money(quote.baseInterest)],
    ["Gastos legales", money(quote.legalExpenses)], ["Ajuste contractual", money(quote.proposedAdjustment)], ["Total a pagar, incluido el inicial", money(quote.totalCustomerPays)],
    ["Cantidad y frecuencia de cuotas", `${quote.installmentCount ?? "[POR COMPLETAR]"} · ${frequency}`], ["Plazo", quote.termMonths != null ? `${quote.termMonths} meses` : "[POR COMPLETAR]"],
    ["Primera cuota", field(quote.firstInstallmentDate)], ["Última cuota", field(quote.finalDueDate)], ["Cargo por mora", "[POR COMPLETAR]"],
  ];
  return <main id="main-content" className="mx-auto max-w-4xl px-4 py-6 sm:p-8">
    <div className="mb-6 flex flex-wrap gap-3 print:hidden"><Link href={`/solicitudes/${id}/entrega`} className="km-secondary">Volver a preparar entrega</Link><PrintButton/></div>
    <article className="km-document rounded-xl border border-line p-5 text-sm leading-7 sm:p-10">
      <h1 className="text-center text-xl font-bold">CONTRATO DE FINANCIAMIENTO DE EQUIPO</h1><p className="mt-3 text-center font-bold">BORRADOR PARA REVISIÓN · {contract.contract_number}</p>
      <p className="mt-5 font-semibold">Este borrador adapta el modelo de YACELL TECH SRL a los datos aprobados. Completa los campos pendientes y revisa las cláusulas y la identidad de la compañía antes de usarlo. No acredita firma, pago ni entrega.</p>
      <p className="mt-4">Entre: YACELL TECH SRL, sociedad comercial organizada conforme a las leyes de la República Dominicana, con domicilio social en Calle Duarte, esquina Dr. Teófilo Ferry #54, La Romana, República Dominicana, teléfono [POR COMPLETAR], correo electrónico [POR COMPLETAR], debidamente representada por [POR COMPLETAR], YASSER ZOROB JIMÉNEZ, en lo adelante, «LA COMPAÑÍA»; y la persona identificada a continuación, en lo adelante, «EL CLIENTE». Ambas serán denominadas conjuntamente «LAS PARTES».</p>
      <p className="mt-2">Empresa de la solicitud: <b>{company}</b>. Verificar que corresponda a la compañía del modelo.</p>
      <h2 className="mt-6 font-bold">DATOS DEL CLIENTE</h2><p>Nombre completo: {field(customer.full_name)}<br/>Cédula/Pasaporte: {field(customer.identity_number)} · Teléfono: {field(customer.phone)}<br/>Correo electrónico: [POR COMPLETAR]<br/>Dirección: {field(customer.address)}<br/>Ubicación: {field(customer.home_location)}<br/>Sector, ciudad/municipio y referencia cercana: [POR COMPLETAR]</p>
      <h2 className="mt-6 font-bold">DIRECCIÓN DE FACTURACIÓN</h2><p>Dirección, sector, ciudad y referencia cercana: [POR COMPLETAR]</p>
      <h2 className="mt-6 font-bold">DATOS DEL EQUIPO</h2><p>Marca: {field(quote.device?.brand)} · Modelo: {field(quote.device?.model)} · Color: [POR COMPLETAR]<br/>IMEI: {field(quote.device?.imei)} · Serie: {field(quote.device?.serialNumber)}<br/>Estado: {quote.device?.condition === "new" ? "Nuevo" : quote.device?.condition === "used" ? "Usado" : "[POR COMPLETAR]"}<br/>Accesorios incluidos: [POR COMPLETAR]</p>
      <h2 className="mt-6 font-bold">DATOS DEL FINANCIAMIENTO</h2><table className="mt-2 w-full border-collapse text-left"><tbody>{rows.map(([label,value]) => <tr key={label} className="border-b border-line"><th className="py-1 pr-4 font-medium">{label}</th><td>{value}</td></tr>)}</tbody></table>
      <h3 className="mt-5 font-bold">Cronograma aprobado</h3>{quote.schedule?.length ? <table className="mt-2 w-full border-collapse text-left"><thead><tr><th>Cuota</th><th>Vencimiento</th><th>Importe</th></tr></thead><tbody>{quote.schedule.map(row => <tr key={row.sequence} className="border-b border-line"><td>{row.sequence}</td><td>{row.dueDate}</td><td>{formatDop(row.amount)}</td></tr>)}</tbody></table> : <p>[CRONOGRAMA NO DISPONIBLE: COMPLETAR ANTES DE FIRMAR]</p>}
      <h2 className="mt-6 font-bold">CLÁUSULAS</h2><p className="mt-3">1. Objeto y entrega. 1.1. LA COMPAÑÍA vende y financia a EL CLIENTE el equipo descrito en la sección «DATOS DEL EQUIPO», para su uso como destinatario final. 1.2. EL CLIENTE declara haber recibido el equipo y sus accesorios en condiciones satisfactorias. 1.3. La entrega no limita los derechos derivados de defectos, vicios y garantía limitada.</p>
      {clauses.map((clause, index) => <p className="mt-3" key={index}>{clause}</p>)}
      <p className="mt-6">Hecho y firmado, libre, voluntariamente y de buena fe, en tres originales de un mismo tenor y efecto. En la ciudad, municipio y provincia de La Romana, República Dominicana, a los _____ días del mes de __________________ del año ______.</p>
      <div className="mt-12 grid grid-cols-2 gap-8"><p>__________________________________<br/>POR LA COMPAÑÍA<br/>Nombre: [POR COMPLETAR]<br/>Calidad: [POR COMPLETAR]</p><p>__________________________________<br/>EL CLIENTE<br/>Nombre: {field(customer.full_name)}<br/>Cédula/Pasaporte: {field(customer.identity_number)}</p></div>
      <p className="mt-6">Constancia de entrega de documentos: EL CLIENTE declara haber recibido: [ ] contrato; [ ] factura; [ ] condiciones de garantía; [ ] acta de entrega.</p>
    </article>
  </main>;
}
