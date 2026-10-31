import { describe, expect, it } from "vitest";
import { handoverProfileSchema, isProvisionalActReference, missingHandoverFields } from "../src/modules/financing/handover-requirements";

const profile = { identity_number: "DEMO-01", phone: "8095550101", address: "Calle de prueba 1", home_location: "Coordenadas o referencia de la vivienda", reference_name: "Contacto de prueba", reference_phone: "+1 809 555 0102" };
describe("handover requirements", () => {
  it("requires all six fields, including a location and a reachable personal reference", () => {
    expect(missingHandoverFields(null)).toHaveLength(6);
    expect(missingHandoverFields(profile)).toHaveLength(0);
    expect(missingHandoverFields({ ...profile, home_location: "  ", reference_phone: "sin teléfono" }).map((field) => field.key)).toEqual(["home_location", "reference_phone"]);
  });
  it("normalizes contact fields without converting a passport identifier into a cedula", () => {
    const result = handoverProfileSchema.parse(profile);
    expect(result.identity_number).toBe("DEMO-01");
    expect(result.phone).toBe("809-555-0101");
    expect(result.reference_phone).toBe("+1-809-555-0102");
  });
  it("recognizes drafts and the application's sample route even with a full URL", () => {
    expect(isProvisionalActReference("EXP/2026/ACTA-001")).toBe(false);
    for (const value of ["borrador-acta.pdf", "EJEMPLO/01", "ACTA PROVISIONAL", "/solicitudes/abc/acta", "https://local.test/solicitudes/abc/acta?print=1"]) expect(isProvisionalActReference(value)).toBe(true);
  });
});
