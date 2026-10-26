import { formatDop } from "@/lib/format-money";
import { groupInstallments, type ScheduledAmount } from "@/modules/financing/installment-groups";
import { hasAdvisoryRecovery } from "@/modules/financing/calculator";

export function hasVariableInstallments(schedule?: ScheduledAmount[]) {
  return Boolean(schedule?.some((row) => row.amount !== schedule[0].amount));
}

export function InstallmentSummary({ schedule, frequency, paymentDistribution }: { schedule?: ScheduledAmount[]; frequency?: string; paymentDistribution?: string }) {
  if (!hasVariableInstallments(schedule)) return null;
  const advisory = hasAdvisoryRecovery(paymentDistribution);
  const groups = groupInstallments(schedule);
  return <div className="space-y-2 rounded-lg border border-accent-line bg-accent-soft p-3 text-xs text-accent">
    <p className="font-semibold">Cuotas {frequency === "monthly" ? "mensuales" : frequency === "fortnightly" ? "quincenales" : "por tramos"}</p>
    {groups.map((group) => <div key={group.first} className="flex justify-between gap-3">
        <span>{group.first === group.last ? `Cuota ${group.first}` : `Cuotas ${group.first}–${group.last}`}</span>
        <b className="tabular-nums">{formatDop(group.amount)}</b>
    </div>)}
    {advisory && <p className="text-[11px] leading-5">La recuperación se adelanta con una diferencia máxima del 20%, sin aumentar el total.</p>}
  </div>;
}
