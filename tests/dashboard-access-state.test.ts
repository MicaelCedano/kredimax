import { describe, expect, it } from "vitest";
import { resolveDashboardAccessState } from "../src/lib/dashboard/access-state";

describe("dashboard access fallback", () => {
  it("uses demo values only when Supabase is not configured", () => {
    expect(resolveDashboardAccessState(false, "unavailable")).toEqual({ kind: "demo" });
    expect(resolveDashboardAccessState(false, "unauthenticated")).toEqual({ kind: "demo" });
  });

  it("does not substitute demo metrics for authenticated access failures", () => {
    expect(resolveDashboardAccessState(true, "unauthenticated")).toEqual({ kind: "login" });
    expect(resolveDashboardAccessState(true, "tenant-selection-required")).toEqual({ kind: "tenant-selection" });
    for (const reason of ["no-membership", "tenant-suspended", "forbidden", "unavailable"] as const) {
      expect(resolveDashboardAccessState(true, reason)).toEqual({ kind: "blocked", reason });
    }
  });
});
