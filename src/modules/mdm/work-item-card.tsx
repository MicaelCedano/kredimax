import { Smartphone } from "lucide-react";
import type { ReactNode } from "react";
import { formatDop } from "@/lib/format-money";
import { mdmActionLabels, type MdmEntry } from "./work-items";

const dayFormatter = new Intl.DateTimeFormat("es-DO", { dateStyle: "medium", timeZone: "UTC" });
const timeFormatter = new Intl.DateTimeFormat("es-DO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Santo_Domingo" });

export function MdmWorkItemCard({ item, children }: { item: MdmEntry; children?: ReactNode }) {
  return <article className="grid min-w-0 gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(12rem,auto)] lg:items-start">
    <div className="flex min-w-0 items-start gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent"><Smartphone size={19} aria-hidden/></span>
      <div className="min-w-0">
        <h3 className="break-words font-semibold text-ink">{item.brand} {item.model}</h3>
        <p className="mt-1 select-all break-all font-mono text-xs text-secondary">IMEI {item.imei}</p>
        {item.serial_number && <p className="mt-1 select-all break-all font-mono text-xs text-muted">Serie {item.serial_number}</p>}
      </div>
    </div>
    <div className="min-w-0 text-sm">
      <p className="break-words font-semibold text-ink">{item.customer}</p>
      <p className="mt-1 break-words text-xs text-muted">{item.branch ?? "Sucursal sin asignar"}</p>
      {!item.confirmed_at && item.oldest_due && item.overdue_balance && <p className="mt-2 text-xs font-semibold text-warning">
        {formatDop(item.overdue_balance)} vencidos · Desde {dayFormatter.format(new Date(item.oldest_due))}
      </p>}
      {!item.confirmed_at && item.action === "enroll" && <p className="mt-2 text-xs text-secondary">{item.loan_status === "approved" ? "Aprobado · Pendiente de entrega" : "Financiamiento activo"}</p>}
      {!item.confirmed_at && item.action === "unlock" && <p className="mt-2 text-xs font-semibold text-positive">Sin cuotas vencidas pendientes</p>}
    </div>
    {item.confirmed_at ? <div className="min-w-0 text-xs lg:text-right">
      <p className="font-semibold text-positive">{mdmActionLabels[item.action].completed}</p>
      <p className="mt-1 break-words text-secondary">{item.operator_name} · <time dateTime={item.confirmed_at}>{timeFormatter.format(new Date(item.confirmed_at))}</time></p>
      {item.reference && <p className="mt-1 break-all text-muted">Referencia {item.reference}</p>}
    </div> : children}
  </article>;
}

export function MdmConfirmationFields({ action }: { action: MdmEntry["action"] }) {
  return <>
    <label className="flex items-start gap-2 text-xs leading-5 text-secondary">
      <input type="checkbox" name="confirmed" value="yes" required className="mt-1 size-4 shrink-0 accent-current"/>
      {mdmActionLabels[action].statement}
    </label>
    <label className="block text-xs text-secondary">
      Referencia en MDM (opcional)
      <input name="reference" maxLength={200} className="km-input mt-1 w-full text-xs"/>
    </label>
  </>;
}
