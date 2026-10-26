import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/modules/payments/actions", () => ({
  recordLoanPayment: async () => null,
}));

import { PaymentForm } from "@/modules/payments/payment-form";

describe("PaymentForm responsive layout", () => {
  it("stacks full-width controls on mobile and switches to a compact row at md", () => {
    const markup = renderToStaticMarkup(createElement(PaymentForm, {
      loanId: "61000000-0000-4000-8000-000000000001",
      balance: "25.00",
      paymentLimit: "125.00",
      idempotencyKey: "81000000-0000-4000-8000-000000000001",
    }));

    expect(markup).toContain("grid w-full min-w-0 gap-2 md:flex md:flex-wrap md:items-center");
    expect(markup).toContain('aria-label="Monto del pago"');
    expect(markup).toContain('max="125.00"');
    expect(markup).toContain('name="amount" value="25.00"');
    expect(markup).toContain('aria-label="Método de pago"');
    expect(markup).toContain('aria-label="Referencia del pago"');
    expect(markup).toContain("w-full rounded bg-brand");
    expect(markup).toContain("md:w-auto md:py-1.5");
  });
});
