import { describe, expect, it } from "vitest";
import { buildDeviceHistory, deviceHistoryDate, type DeviceHistorySource } from "../src/modules/devices/history";

function source(): DeviceHistorySource {
  return {
    applications: [{ id: "application", customer_id: "customer", status: "approved", created_at: "2026-10-20T13:00:00Z", created_by: "seller",
      customer: { id: "customer", full_name: "Cliente de prueba" },
      events: [{ to_status: "approved", metadata: { loanId: "loan" }, created_at: "2026-10-21T13:00:00Z" }],
    }],
    loans: [{ id: "loan", customer_id: "customer", status: "active", created_at: "2026-10-21T13:00:00Z", delivered_at: "2026-10-22", delivered_by: "operator", customer: { id: "customer", full_name: "Cliente de prueba" } }],
  };
}

describe("device documentary history", () => {
  it("uses the approval link to show one record with the recipient, date and actors", () => {
    expect(buildDeviceHistory(source())).toEqual([expect.objectContaining({ applicationId: "application", customer: { id: "customer", full_name: "Cliente de prueba" }, deliveredAt: "2026-10-22", deliveredBy: "operator", registeredBy: "seller" })]);
  });
  it("does not report an approved or rejected application as delivered", () => {
    const data = source();
    data.loans = [];
    expect(buildDeviceHistory(data)[0].deliveredAt).toBeNull();
    data.applications[0].status = "rejected";
    expect(buildDeviceHistory(data)[0]).toMatchObject({ status: "rejected", deliveredAt: null });
  });
  it("keeps older loans visible when their application event is missing", () => {
    const data = source();
    data.applications = [];
    expect(buildDeviceHistory(data)[0]).toMatchObject({ applicationId: null, deliveredAt: "2026-10-22" });
  });
  it("does not attribute a different customer's delivery to an application", () => {
    const data = source();
    data.loans[0].customer_id = "other-customer";
    expect(buildDeviceHistory(data).find((row) => row.applicationId === "application")?.deliveredAt).toBeNull();
  });
  it("uses the latest approval with a loan id regardless of input ordering", () => {
    const data = source();
    data.applications[0].events.push({ to_status: "approved", metadata: { loanId: "older-loan" }, created_at: "2026-10-20T13:00:00Z" });
    expect(buildDeviceHistory(data)).toHaveLength(1);
    expect(buildDeviceHistory(data)[0].deliveredAt).toBe("2026-10-22");
  });
  it("handles hidden customers, empty records and malformed event metadata", () => {
    const data = source();
    data.applications[0].customer = null;
    data.applications[0].events[0].metadata = null;
    expect(buildDeviceHistory(data).find((row) => row.applicationId === "application")).toMatchObject({ customer: null, deliveredAt: null });
    expect(buildDeviceHistory({ applications: [], loans: [] })).toEqual([]);
  });
  it("preserves the delivery calendar day and formats timestamps in the business timezone", () => {
    expect(deviceHistoryDate("2026-10-22")).toBe("22/10/2026");
    expect(deviceHistoryDate("2026-10-22T01:00:00Z")).toBe("21/10/2026");
    expect(deviceHistoryDate("invalid")).toBe("Fecha no disponible");
  });
});
