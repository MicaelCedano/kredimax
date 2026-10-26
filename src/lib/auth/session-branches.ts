export type MembershipBranch = { branch_id: string | null; role: string };

export function branchIdsForMemberships(memberships: readonly MembershipBranch[]): string[] {
  const branchIds = new Set<string>();
  for (const membership of memberships) {
    if (membership.role !== "tenant_admin" && membership.branch_id) branchIds.add(membership.branch_id);
  }
  return [...branchIds];
}
