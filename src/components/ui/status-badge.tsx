const states: Record<string, { label: string; tone: string }> = {
  pending: { label: "Pendiente", tone: "bg-accent-soft text-accent ring-accent-line" },
  partial: { label: "Pago parcial", tone: "bg-warning-soft text-warning ring-warning-line" },
  overdue: { label: "Vencida", tone: "bg-danger-soft text-danger ring-danger-line" },
  paid: { label: "Pagada", tone: "bg-positive-soft text-positive ring-positive-line" },
  registered: { label: "Registrado", tone: "bg-positive-soft text-positive ring-positive-line" },
  reversed: { label: "Revertido", tone: "bg-soft text-secondary ring-line" },
  documents_requested: { label: "Documentación solicitada", tone: "bg-warning-soft text-warning ring-warning-line" },
  approved: { label: "Aprobada", tone: "bg-positive-soft text-positive ring-positive-line" },
  rejected: { label: "Rechazada", tone: "bg-danger-soft text-danger ring-danger-line" },
  active: { label: "Activo", tone: "bg-accent-soft text-accent ring-accent-line" },
  paid_off: { label: "Pagado", tone: "bg-positive-soft text-positive ring-positive-line" },
  cancelled: { label: "Cancelado", tone: "bg-soft text-secondary ring-line" },
  draft: { label: "Borrador", tone: "bg-soft text-secondary ring-line" },
  waived: { label: "Exonerada", tone: "bg-soft text-secondary ring-line" },
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const state = states[status];
  return <span className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${state?.tone ?? "bg-soft text-secondary ring-line"}`}><span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-current"/>{label ?? state?.label ?? status}</span>;
}

export function CustomerLabel({ name, large = false, avatarOnly = false, photoUrl }: { name: string; large?: boolean; avatarOnly?: boolean; photoUrl?: string }) {
  const initials = name.replace(/^DEMO\s*·\s*/i, "").trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase("es-DO");
  return <span className="flex min-w-0 items-center gap-3"><CustomerAvatar initials={initials} large={large} photoUrl={photoUrl}/>{!avatarOnly && <span className="font-semibold text-ink">{name}</span>}</span>;
}

import { CustomerAvatar } from "@/components/ui/customer-avatar";

