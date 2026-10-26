import { addIsoCalendarDays } from "@/lib/business-date";

export function firstPaymentDate(approvalDate: string, frequency: "monthly" | "fortnightly") {
  return addIsoCalendarDays(approvalDate, frequency === "fortnightly" ? 15 : 30);
}

/** Rebase dates only: keep installment amounts and all quoted financial terms intact. */
export function quoteDatesFromApproval<T extends {
  frequency: "monthly" | "fortnightly";
  firstInstallmentDate: string;
  finalDueDate: string;
  schedule: { sequence: number; dueDate: string }[];
}>(quote: T, approvalDate: string): T {
  const first = firstPaymentDate(approvalDate, quote.frequency);
  const firstDate = new Date(`${first}T00:00:00.000Z`);
  const schedule = quote.schedule.map((row) => {
    if (quote.frequency === "fortnightly") return { ...row, dueDate: addIsoCalendarDays(first, (row.sequence - 1) * 15) };
    const due = new Date(Date.UTC(firstDate.getUTCFullYear(), firstDate.getUTCMonth() + row.sequence - 1, 1));
    const lastDay = new Date(Date.UTC(due.getUTCFullYear(), due.getUTCMonth() + 1, 0)).getUTCDate();
    due.setUTCDate(Math.min(firstDate.getUTCDate(), lastDay));
    return { ...row, dueDate: due.toISOString().slice(0, 10) };
  });
  return { ...quote, firstInstallmentDate: first, finalDueDate: schedule.at(-1)?.dueDate ?? first, schedule };
}
