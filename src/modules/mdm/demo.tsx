"use client";

import { useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { Feedback } from "@/components/ui/feedback";
import { PanelHeading } from "@/components/ui/panel-heading";
import { MdmConfirmationFields, MdmWorkItemCard } from "./work-item-card";
import { mdmActionLabels, mdmTabs, type MdmAction, type MdmEntry, type MdmTab } from "./work-items";

type DemoDevice = { item: MdmEntry; state: "not_enrolled" | "enrolled" | "locked"; overdue: boolean };

const demoDevices: DemoDevice[] = [
  { item: demoItem("01", "Valeria Demo", "Apple", "iPhone 15", "approved"), state: "not_enrolled", overdue: false },
  { item: demoItem("02", "Joel Demo", "Samsung", "Galaxy A55", "active"), state: "enrolled", overdue: true },
  { item: demoItem("03", "Nadia Demo", "Motorola", "Moto G85", "active"), state: "locked", overdue: false },
];

function demoItem(id: string, customer: string, brand: string, model: string, loanStatus: string): MdmEntry {
  return {
    id, loan_id: id, customer, brand, model, loan_status: loanStatus,
    imei: `DEMO-${id}`, serial_number: `SERIE-DEMO-${id}`, branch: "Sucursal Demo",
    action: "enroll", oldest_due: null, overdue_balance: null, previous_event_id: null,
    operator_name: null, reference: null, confirmed_at: null,
  };
}

function pendingAction(device: DemoDevice): MdmAction | null {
  if (device.state === "not_enrolled") return "enroll";
  if (device.state === "locked") return device.overdue ? null : "unlock";
  return device.overdue ? "lock" : null;
}

export function MdmDemo() {
  const [devices, setDevices] = useState(demoDevices);
  const [history, setHistory] = useState<MdmEntry[]>([]);
  const [tab, setTab] = useState<MdmTab>("enroll");
  const [message, setMessage] = useState("");
  const definition = mdmTabs.find((entry) => entry.key === tab) ?? mdmTabs[0];
  const rows = tab === "completed" ? history : devices.filter((device) => pendingAction(device) === tab).map(({ item, overdue }) => ({
    ...item, action: tab, oldest_due: overdue ? "2026-11-04" : null, overdue_balance: overdue ? "2450.00" : null,
  }));
  const waitingForPayment = devices.filter((device) => device.state === "locked" && device.overdue);

  function confirm(item: MdmEntry, formData: FormData) {
    if (formData.get("confirmed") !== "yes") return;
    const reference = String(formData.get("reference") ?? "").trim();
    const nextState = item.action === "lock" ? "locked" : "enrolled";
    const confirmedAt = new Date().toISOString();
    setDevices((current) => current.map((device) => device.item.id === item.id ? { ...device, state: nextState } : device));
    setHistory((current) => [{ ...item, id: String(current.length + 1), operator_name: "Programador Demo", reference, confirmed_at: confirmedAt }, ...current]);
    setMessage(`${item.model}: ${mdmActionLabels[item.action].completed.toLowerCase()} en la demo.`);
  }

  function simulatePayment(device: DemoDevice) {
    setDevices((current) => current.map((row) => row.item.id === device.item.id ? { ...row, overdue: false } : row));
    setTab("unlock");
    setMessage(`Pago simulado para ${device.item.customer}. El equipo pasó a Por desbloquear.`);
  }

  function reset() {
    setDevices(demoDevices);
    setHistory([]);
    setTab("enroll");
    setMessage("Demo reiniciada.");
  }

  return <>
    <Feedback tone="warning">Los cambios son de práctica y se borran al recargar. Usa los botones para simular las acciones del programador.</Feedback>
    {message && <Feedback tone="success">{message}</Feedback>}
    <nav aria-label="Colas de demostración" className="flex flex-wrap gap-2">
      {mdmTabs.map(({ key, label }) => <button key={key} type="button" aria-pressed={key === tab} onClick={() => setTab(key)} className={key === tab ? "km-primary" : "km-secondary"}>{label}</button>)}
      <button type="button" onClick={reset} className="km-secondary">Reiniciar demo</button>
    </nav>
    {waitingForPayment.length > 0 && <div className="flex flex-wrap gap-2 rounded-lg border border-line bg-surface p-4">
      {waitingForPayment.map((device) => <button key={device.item.id} type="button" onClick={() => simulatePayment(device)} className="km-secondary">Simular pago de {device.item.customer}</button>)}
    </div>}
    <section className="km-panel min-w-0 overflow-hidden">
      <PanelHeading title={`${definition.label} · ${rows.length}`} description={definition.description}/>
      {rows.length ? <div className="divide-y divide-line">
        {rows.map((item) => <MdmWorkItemCard key={`${tab}-${item.id}`} item={item}>
          <form action={(formData) => confirm(item, formData)} className="space-y-2 rounded-lg border border-line bg-subtle p-3">
            <MdmConfirmationFields action={item.action}/>
            <button type="submit" className="km-primary w-full">{mdmActionLabels[item.action].confirm}</button>
          </form>
        </MdmWorkItemCard>)}
      </div> : <EmptyState title="La cola está al día" description={definition.description}/>}
    </section>
  </>;
}
