import { describe, expect, it } from "vitest";
import { addIsoCalendarDays, dateOnlyValue, isoDateInTimeZone } from "../src/lib/business-date";

describe("fechas de negocio", () => {
  it("determina el día de Santo Domingo a ambos lados de medianoche", () => {
    expect(isoDateInTimeZone(new Date("2026-10-20T02:00:00.000Z"))).toBe("2026-10-19");
    expect(isoDateInTimeZone(new Date("2026-10-20T04:00:00.000Z"))).toBe("2026-10-20");
  });

  it("suma días calendario sin depender de la zona horaria del host", () => {
    expect(addIsoCalendarDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addIsoCalendarDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("rechaza fechas imposibles y conserva la fecha al formatear date-only", () => {
    expect(() => addIsoCalendarDays("2026-02-30", 7)).toThrow("Fecha ISO inválida");
    const label = new Intl.DateTimeFormat("es-DO", { dateStyle: "medium", timeZone: "America/Santo_Domingo" });
    expect(label.format(dateOnlyValue("2026-10-22"))).toContain("22");
  });
});
