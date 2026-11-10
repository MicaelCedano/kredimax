export const mdmActions = ["enroll", "lock", "unlock"] as const;
export type MdmAction = typeof mdmActions[number];
export type MdmTab = MdmAction | "completed";

export const mdmTabs: { key: MdmTab; label: string; description: string }[] = [
  { key: "enroll", label: "Por enrolar", description: "Financiamientos aprobados o activos que esperan confirmación del registro en MDM." },
  { key: "lock", label: "Por bloquear", description: "Equipos enrolados con al menos una cuota vencida pendiente de pago." },
  { key: "unlock", label: "Por desbloquear", description: "Equipos con bloqueo confirmado y sin cuotas vencidas pendientes." },
  { key: "completed", label: "Completadas", description: "Acciones confirmadas por el programador, con fecha y referencia." },
];

export const mdmActionLabels = {
  enroll: { confirm: "Marcar como enrolado", completed: "Enrolado", statement: "Ya registré el equipo en MDM." },
  lock: { confirm: "Marcar como bloqueado", completed: "Bloqueado", statement: "Ya confirmé el bloqueo en MDM." },
  unlock: { confirm: "Marcar como desbloqueado", completed: "Desbloqueado", statement: "Ya confirmé el desbloqueo en MDM." },
} satisfies Record<MdmAction, { confirm: string; completed: string; statement: string }>;

export type MdmEntry = {
  id: string;
  loan_id: string;
  previous_event_id: string | null;
  action: MdmAction;
  loan_status: string;
  customer: string;
  brand: string;
  model: string;
  imei: string;
  serial_number: string | null;
  branch: string | null;
  oldest_due: string | null;
  overdue_balance: string | null;
  operator_name: string | null;
  reference: string | null;
  confirmed_at: string | null;
};

export function mdmHref(tab: MdmTab, search = "", page = 1, completed?: MdmAction) {
  const query = new URLSearchParams({ tab });
  if (search) query.set("q", search);
  if (page > 1) query.set("page", String(page));
  if (completed) query.set("completada", completed);
  return `/mdm?${query}`;
}
