import { formatDop } from "@/lib/format-money";
import { hasAdvisoryRecovery } from "@/modules/financing/calculator";

type RecoveryQuote = {
  paymentDistribution?: string; recoveryEnabled?: boolean; recoveryMet?: boolean;
  recoveryAtSixMonths?: string; recoveryAtHalf?: string; recoveryTarget?: string;
};

export function RecoverySummary({ quote }: { quote: RecoveryQuote }) {
  const level = hasAdvisoryRecovery(quote.paymentDistribution);
  const balanced = quote.paymentDistribution === "balanced_20_v1";
  return <div className="rounded-lg border border-line bg-subtle p-3 text-xs text-secondary">
    <div className="flex flex-wrap items-center justify-between gap-2 font-semibold">
      <span>{level ? "Recuperación · primeros 6 meses" : "Recuperación histórica · mitad del plazo"}</span>
      <span className="text-muted">{level ? "Orientativa" : quote.recoveryEnabled ? quote.recoveryMet ? "Cumple" : "Revisar" : "Referencia"}</span>
    </div>
    <div className="mt-2 flex flex-wrap justify-between gap-2"><span>Inicial y cuotas previstas</span><b>{formatDop((level ? quote.recoveryAtSixMonths : quote.recoveryAtHalf) ?? "0")}</b></div>
    {quote.recoveryEnabled && <p className="mt-1 text-[11px] text-muted">Referencia del equipo: {formatDop(quote.recoveryTarget ?? "0")}</p>}
    {level && <p className="mt-2 text-[11px] leading-5 text-muted">{balanced ? "La recuperación se adelanta con una diferencia máxima del 20% entre cuotas y sin aumentar el total. " : "Se recupera lo que permiten las cuotas parejas. "}Alcanzar el 100% no es obligatorio para aprobar.</p>}
  </div>;
}
