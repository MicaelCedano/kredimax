"use client";

import { useRef, useState } from "react";

export function PrintBeforePayment({ loanId, type, idempotencyKey }: { loanId: string; type: "down_payment" | "installment"; idempotencyKey: string }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [error, setError] = useState("");
  function open() {
    const form = anchor.current?.closest("form");
    if (!form) return;
    const values = new FormData(form);
    const amount = type === "installment" ? String(values.get("amount") ?? "") : "0";
    if (type === "installment" && !/^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/.test(amount)) { setError("Escribe un monto válido antes de imprimir."); return; }
    const query = new URLSearchParams({ tipo: type, monto: amount, metodo: String(values.get("paymentMethod") ?? "cash"), control: idempotencyKey });
    const opened = window.open(`/financiamientos/${loanId}/comprobante?${query}`, "_blank", "noopener,noreferrer");
    // noopener can return null even when the new tab opened; do not report that as a failure.
    opened?.focus();
    setError("");
  }
  return <div className="w-full space-y-2 md:basis-full"><span ref={anchor}/><button type="button" onClick={open} className="km-secondary">Imprimir formato para firma</button><p className="text-[11px] leading-5 text-muted">Imprime el formato, recoge la firma y adjunta la foto. Al guardar se emite el recibo numerado y se abre para imprimir.</p>{error && <p role="alert" className="text-xs text-danger">{error}</p>}</div>;
}
