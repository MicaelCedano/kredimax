/** Terms offered for new applications; historical schedules remain supported by the calculator. */
export const NEW_FINANCING_TERMS = [3, 5, 6, 8, 12] as const;

export function newFinancingTerms(configured: readonly number[] = NEW_FINANCING_TERMS) {
  return configured.filter((term) => NEW_FINANCING_TERMS.some((allowed) => allowed === term));
}
