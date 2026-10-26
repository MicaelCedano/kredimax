export type ScheduledAmount = { sequence: number; amount: string };

export function groupInstallments(schedule: ScheduledAmount[] = []) {
  const groups: { first: number; last: number; amount: string }[] = [];
  for (const row of schedule) {
    const previous = groups.at(-1);
    if (previous?.amount === row.amount) previous.last = row.sequence;
    else groups.push({ first: row.sequence, last: row.sequence, amount: row.amount });
  }
  return groups;
}

/** New quotes use six-month periods; legacy quotes retain their original blocks. */
export function semesterInstallments(schedule: ScheduledAmount[] = [], frequency?: "monthly" | "fortnightly") {
  const midpoint = frequency ? Math.min(schedule.length, 6 * (frequency === "fortnightly" ? 2 : 1)) : Math.floor(schedule.length / 2);
  return [
    { label: "Primer semestre", groups: groupInstallments(schedule.slice(0, midpoint)) },
    { label: "Segundo semestre", groups: groupInstallments(schedule.slice(midpoint)) },
  ].filter((semester) => semester.groups.length > 0);
}
