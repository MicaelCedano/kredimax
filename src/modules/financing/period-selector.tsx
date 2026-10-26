"use client";

import { ChoiceCards } from "@/components/forms/choice-cards";
import { useMemo } from "react";
import { calculateFinancingQuote, type FinancingQuote } from "@/modules/financing/calculator";
import { groupInstallments } from "@/modules/financing/installment-groups";
import { formatDop } from "@/lib/format-money";

export function FinancingPeriodSelector({ allowedTerms, termMonths, frequency, onTermChange, onFrequencyChange, termError, frequencyError, quote, today, recoveryTargetPercent }: {
  allowedTerms: number[]; termMonths: number; frequency: "monthly" | "fortnightly";
  onTermChange: (value: number) => void; onFrequencyChange: (value: "monthly" | "fortnightly") => void;
  termError?: string; frequencyError?: string;
  quote: FinancingQuote | null; today: string; recoveryTargetPercent: string;
}) {
  const previews = useMemo(() => allowedTerms.map((months) => {
    if (!quote) return { months, groups: null };
    try {
      const preview = months === quote.termMonths ? quote : calculateFinancingQuote({
        salePrice: quote.salePrice, deviceCost: quote.deviceCost, downPaymentPercent: quote.downPaymentPercent,
        annualRatePercent: quote.annualRatePercent, legalExpenses: quote.legalExpenses, termMonths: months,
        frequency: quote.frequency, firstInstallmentDate: quote.firstInstallmentDate, today,
        recoveryTargetPercent, recoveryEnabled: quote.recoveryEnabled,
        installmentRounding: quote.installmentRounding,
        paymentDistribution: quote.paymentDistribution,
      });
      return { months, groups: groupInstallments(preview.schedule) };
    } catch { return { months, groups: null }; }
  }), [allowedTerms, quote, today, recoveryTargetPercent]);
  const cadence = frequency === "fortnightly" ? "quincenales" : "mensuales";
  return <>
    <ChoiceCards name="termMonths" legend="Plazo (meses)" value={String(termMonths)} onChange={(value) => onTermChange(Number(value))} error={termError} detailed
      description={`Cuotas ${cadence} en múltiplos de RD$50. La primera cuota supera a la menor posterior en un máximo del 20%, manteniendo el total del plan.`}
      options={previews.map(({ months, groups }) => ({ value: String(months), label: months, caption: "meses",
        ariaLabel: `${months} meses${groups ? `, cuotas ${cadence}: ${groups.map((group) => `cuotas ${group.first}${group.last !== group.first ? ` a ${group.last}` : ""}, ${formatDop(group.amount)} cada una`).join("; ")}` : ""}`,
        detail: groups ? <span className="km-term-payments"><span className="km-term-cadence">Cuotas {cadence}</span>{groups.map((group) => <span key={group.first} className="km-term-payment"><span className="km-term-range">{group.first === group.last ? `Cuota ${group.first}` : `Cuotas ${group.first}–${group.last}`}</span><strong className="km-term-amount">{formatDop(group.amount)}</strong></span>)}</span> : <span className="km-term-unavailable">{quote ? "Cotización no disponible" : "Completa el precio"}</span>,
      }))}/>
    <ChoiceCards name="frequency" legend="Frecuencia de pago" value={frequency} onChange={(value) => onFrequencyChange(value as "monthly" | "fortnightly")} error={frequencyError} words
      description={`${termMonths * (frequency === "fortnightly" ? 2 : 1)} pagos en total.`}
      options={[{ value: "monthly", label: "Mensual", caption: `${termMonths} pagos`, ariaLabel: "Mensual" }, { value: "fortnightly", label: "Quincenal", caption: `${termMonths * 2} pagos`, ariaLabel: "Quincenal" }]}/>
  </>;
}
