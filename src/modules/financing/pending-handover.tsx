import Link from "next/link";
import { ArrowRight, CheckCircle2, FilePenLine, MapPin, PackageCheck } from "lucide-react";
import { missingHandoverFields, type HandoverProfile } from "@/modules/financing/handover-requirements";

export function PendingHandover({ applicationId, profile }: { applicationId: string; profile: Partial<HandoverProfile> | null }) {
  const missing = missingHandoverFields(profile);
  return <section aria-labelledby="pending-handover-title" className="km-panel mb-6 overflow-hidden">
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line px-5 py-5 sm:px-6"><div><h2 id="pending-handover-title" className="flex items-center gap-2 text-base font-semibold"><PackageCheck size={20} className="text-accent" aria-hidden/>Aprobada · entrega pendiente</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted">La aprobación está lista. Falta completar el expediente, verificar el documento definitivo firmado y entregar el equipo.</p></div><Link href={`/solicitudes/${applicationId}/entrega`} className="km-primary">Preparar entrega<ArrowRight size={16} aria-hidden/></Link></div>
    <ol className="grid gap-5 p-5 sm:grid-cols-3 sm:p-6">{[
      { Icon: missing.length ? MapPin : CheckCircle2, title: "1. Completar expediente", detail: missing.length ? `${missing.length} datos por completar o revisar` : "Datos obligatorios completos" },
      { Icon: FilePenLine, title: "2. Revisar y firmar", detail: "Ejemplo provisional disponible; se requiere el acta definitiva firmada." },
      { Icon: PackageCheck, title: "3. Registrar la entrega", detail: "Inicial con evidencia, fecha y responsable de la entrega." },
    ].map(({ Icon, title, detail }) => <li key={title} className="flex items-start gap-3"><span className="mt-0.5 text-accent"><Icon size={19} aria-hidden/></span><div><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 text-xs leading-5 text-muted">{detail}</p></div></li>)}</ol>
  </section>;
}
