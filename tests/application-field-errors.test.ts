import { describe, expect, it } from "vitest";
import { applicationFields, applicationIssueFields } from "../src/modules/financing/application-errors";

describe("Credit application validation feedback", () => {
  it("keeps the first IMEI error and sends the operator to the equipment step", () => {
    const fields = applicationIssueFields([
      { path: ["imei"], message: "El IMEI debe tener exactamente 15 dígitos numéricos." },
      { path: ["imei"], message: "El IMEI no supera la validación de su dígito de control." },
    ]);
    expect(fields).toEqual({ imei: "El IMEI debe tener exactamente 15 dígitos numéricos." });
    expect(applicationFields.imei.step).toBe(1);
  });

  it("describes other invalid fields in Spanish and does not render hidden request metadata as editable fields", () => {
    const fields = applicationIssueFields([
      { path: ["model"], message: "Too big" },
      { path: ["submissionKey"], message: "Invalid UUID" },
    ]);
    expect(fields.model).toContain("modelo");
    expect(fields).not.toHaveProperty("submissionKey");
  });
});
