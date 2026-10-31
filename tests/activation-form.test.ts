import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LoanActivationForm } from "../src/modules/financing/activation-form";

describe("LoanActivationForm", () => {
  it("requires explicit signed-contract evidence attestation and labels the reference as unverified", () => {
    const markup = renderToStaticMarkup(createElement(LoanActivationForm, {
      applicationId: "21000000-0000-4000-8000-000000000001",
      loanId: "61000000-0000-4000-8000-000000000001",
      idempotencyKey: "81000000-0000-4000-8000-000000000001",
      initialAmount: "RD$ 300.00",
      today: "2026-10-20",
    }));

    expect(markup).toMatch(/<input(?=[^>]*type="checkbox")(?=[^>]*name="contractEvidenceAttested")(?=[^>]*required="")[^>]*\/>/);
    expect(markup).toContain("Confirmo que verifiqué que el contrato está firmado y documentado");
    expect(markup).toContain("name=\"signedDocumentPath\"");
    expect(markup).toContain("Esta referencia corresponde al contrato firmado");
    expect(markup).toContain('name="paymentEvidence"');
    expect(markup).toContain('name="signedReceiptAttested"');
    expect(markup).toContain("recibo firmado por el cliente");
    expect(markup).toMatch(/<input(?=[^>]*type="checkbox")(?=[^>]*name="notarialActAttested")(?=[^>]*required="")[^>]*\/>/);
    expect(markup).toContain("acta notarial definitiva firmada");
    expect(markup).toContain("El ejemplo provisional de KrediMax no es el documento firmado");
  });

  it("disables activation until the required profile is complete", () => {
    const markup = renderToStaticMarkup(createElement(LoanActivationForm, {
      applicationId: "21000000-0000-4000-8000-000000000001", loanId: "61000000-0000-4000-8000-000000000001",
      idempotencyKey: "81000000-0000-4000-8000-000000000001", initialAmount: "RD$ 300.00", today: "2026-10-20", profileComplete: false,
    }));
    expect(markup).toContain('<fieldset disabled=""');
    expect(markup).toContain("Completa y guarda los datos del expediente");
  });
});
