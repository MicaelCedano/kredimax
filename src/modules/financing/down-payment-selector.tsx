"use client";

import { ChoiceCards } from "@/components/forms/choice-cards";
import { DOWN_PAYMENT_PERCENT_OPTIONS } from "@/modules/financing/calculator";

export function DownPaymentSelector({ value, allowedOptions, onChange, error }: {
  value: string; allowedOptions: string[]; onChange: (value: string) => void; error?: string;
}) {
  const selected = allowedOptions.find((option) => Number(option) === Number(value)) ?? value;
  return <ChoiceCards name="downPaymentPercent" legend="Inicial (%)" value={selected} onChange={onChange} error={error}
    description="El inicial, el saldo financiado y las cuotas se actualizan al seleccionar."
    options={DOWN_PAYMENT_PERCENT_OPTIONS.map((percent) => {
      const allowed = allowedOptions.find((option) => Number(option) === Number(percent));
      return { value: allowed ?? percent, label: <>{Number(percent)}<span>%</span></>, caption: allowed ? "de inicial" : "No disponible", disabled: !allowed,
        ariaLabel: `${Number(percent)}% de inicial${!allowed ? ", no permitido" : ""}`, title: !allowed ? `${Number(percent)}% no está permitido por las reglas actuales` : undefined };
    })}/>;
}
