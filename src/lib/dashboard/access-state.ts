export type DashboardAccessState =
  | { kind: "demo" }
  | { kind: "login" }
  | { kind: "tenant-selection" }
  | { kind: "blocked"; reason: "no-membership" | "tenant-suspended" | "forbidden" | "unavailable" };

export function resolveDashboardAccessState(
  supabaseConfigured: boolean,
  reason: "unauthenticated" | "no-membership" | "tenant-selection-required" | "tenant-suspended" | "forbidden" | "unavailable",
): DashboardAccessState {
  if (!supabaseConfigured) return { kind: "demo" };
  if (reason === "unauthenticated") return { kind: "login" };
  if (reason === "tenant-selection-required") return { kind: "tenant-selection" };
  return { kind: "blocked", reason };
}
