import { describe, expect, it } from "vitest";
import { branchIdsForMemberships } from "../src/lib/auth/session-branches";

describe("branchIdsForMemberships", () => {
  it("returns only unique assigned branch ids needed for the session label", () => {
    expect(branchIdsForMemberships([
      { role: "branch_manager", branch_id: "branch-a" },
      { role: "cashier", branch_id: "branch-a" },
      { role: "sales", branch_id: "branch-b" },
      { role: "tenant_admin", branch_id: "admin-context" },
      { role: "branch_manager", branch_id: null },
    ])).toEqual(["branch-a", "branch-b"]);
  });

  it("returns no branch ids when there is no assigned operational branch", () => {
    expect(branchIdsForMemberships([
      { role: "tenant_admin", branch_id: "admin-context" },
      { role: "branch_manager", branch_id: null },
    ])).toEqual([]);
  });
});
