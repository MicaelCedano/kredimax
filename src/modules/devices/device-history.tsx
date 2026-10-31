import Link from "next/link";
import { StatusBadge } from "@/components/ui/status-badge";
import { deviceHistoryDate, type DeviceHistoryEntry } from "./history";

export function DeviceHistory({ entries, compact = false }: { entries: DeviceHistoryEntry[]; compact?: boolean }) {
  if (!entries.length) return <p className="text-xs text-muted">Sin solicitud o entrega visible asociada.</p>;
  const visible = compact ? entries.slice(0, 1) : entries;
  return <div className="space-y-4">{visible.map((entry) => <article key={entry.key} className={compact ? "space-y-2" : "space-y-3 rounded-xl border border-line p-4"}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><p className="text-xs text-muted">{entry.deliveredAt ? "Recibido por" : "Cliente de la solicitud"}</p>
        {entry.customer ? <Link href={`/clientes/${entry.customer.id}`} className="mt-1 block break-words text-sm font-semibold text-accent hover:underline">{entry.customer.full_name}</Link> : <p className="mt-1 text-sm text-secondary">Cliente no disponible en tu acceso</p>}
      </div>
      {!compact && <StatusBadge status={entry.status}/>}
    </div>
    <p className="text-xs text-secondary">{entry.deliveredAt ? <>Entregado el <time dateTime={entry.deliveredAt}>{deviceHistoryDate(entry.deliveredAt)}</time></> : entry.status === "rejected" ? "Solicitud rechazada · sin entrega registrada" : entry.status === "cancelled" ? "Cancelado · sin entrega registrada" : "Sin entrega registrada"}</p>
    {!compact && <>
      <p className="text-xs text-muted">Registro del expediente: <time dateTime={entry.registeredAt}>{deviceHistoryDate(entry.registeredAt)}</time></p>
      {entry.registeredBy && <p className="break-all text-xs text-muted">Registrado por: usuario {entry.registeredBy}</p>}
      {entry.deliveredBy && <p className="break-all text-xs text-muted">Entrega registrada por: usuario {entry.deliveredBy}</p>}
      {entry.applicationId && <Link href={`/solicitudes/${entry.applicationId}`} className="inline-flex min-h-10 items-center text-xs font-semibold text-accent hover:underline">Consultar solicitud</Link>}
    </>}
  </article>)}{compact && entries.length > 1 && <p className="text-xs text-muted">{entries.length} registros en el historial</p>}</div>;
}
