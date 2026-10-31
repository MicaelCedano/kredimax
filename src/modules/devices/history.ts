import { BUSINESS_TIME_ZONE } from "@/lib/business-date";

// Embedded relations use the caller's session and existing tenant/branch RLS.
export const deviceHistorySelect = `
  id,imei,brand,model,serial_number,created_at,
  applications:credit_applications!applications_device_tenant_fk(
    id,customer_id,status,created_at,created_by,
    customer:customers!applications_customer_tenant_fk(id,full_name),
    events:credit_application_events!application_events_application_tenant_fk(to_status,metadata,created_at)
  ),
  loans:loans!loans_device_tenant_fk(
    id,customer_id,status,created_at,delivered_at,delivered_by,
    customer:customers!loans_customer_tenant_fk(id,full_name)
  )
`;

type Customer = { id: string; full_name: string } | null;
type DeviceLoan = {
  id: string; customer_id: string; status: string; created_at: string;
  delivered_at: string | null; delivered_by: string | null; customer: Customer;
};
export type DeviceHistorySource = {
  applications: {
    id: string; customer_id: string; status: string; created_at: string; created_by: string;
    customer: Customer;
    events: { to_status: string | null; metadata: unknown; created_at: string }[];
  }[];
  loans: DeviceLoan[];
};
export type DeviceRecord = DeviceHistorySource & {
  id: string; imei: string; brand: string; model: string; serial_number: string | null; created_at: string;
};
export type DeviceHistoryEntry = {
  key: string; applicationId: string | null; customer: Customer;
  registeredAt: string; registeredBy: string | null; status: string;
  deliveredAt: string | null; deliveredBy: string | null;
};

export function buildDeviceHistory(source: DeviceHistorySource): DeviceHistoryEntry[] {
  const loans = new Map(source.loans.map((loan) => [loan.id, loan]));
  const linkedLoans = new Set<string>();
  const history = source.applications.map((application): DeviceHistoryEntry => {
    // Approval events are the authoritative application -> loan link. Never
    // attribute another customer's delivery or infer delivery from approval.
    const approval = [...application.events].sort((a, b) => b.created_at.localeCompare(a.created_at))
      .find((event) => event.to_status === "approved" && event.metadata !== null
        && typeof event.metadata === "object" && "loanId" in event.metadata && typeof event.metadata.loanId === "string");
    const loanId = (approval?.metadata as { loanId?: string } | undefined)?.loanId;
    const candidate = loanId ? loans.get(loanId) : undefined;
    const loan = candidate?.customer_id === application.customer_id ? candidate : undefined;
    if (loan) linkedLoans.add(loan.id);
    return {
      key: application.id, applicationId: application.id, customer: application.customer,
      registeredAt: application.created_at, registeredBy: application.created_by,
      status: loan?.status ?? application.status,
      deliveredAt: loan?.delivered_at ?? null, deliveredBy: loan?.delivered_by ?? null,
    };
  });
  // Keep legacy loans visible even when their original approval event is absent.
  for (const loan of source.loans) {
    if (!linkedLoans.has(loan.id)) history.push({
      key: loan.id, applicationId: null, customer: loan.customer,
      registeredAt: loan.created_at, registeredBy: null, status: loan.status,
      deliveredAt: loan.delivered_at, deliveredBy: loan.delivered_by,
    });
  }
  return history.sort((a, b) => b.registeredAt.localeCompare(a.registeredAt));
}

export function deviceHistoryDate(value: string) {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(dateOnly ? `${value}T12:00:00Z` : value);
  if (!Number.isFinite(date.getTime())) return "Fecha no disponible";
  return new Intl.DateTimeFormat("es-DO", {
    day: "2-digit", month: "2-digit", year: "numeric", timeZone: dateOnly ? "UTC" : BUSINESS_TIME_ZONE,
  }).format(date);
}
