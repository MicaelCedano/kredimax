import { describe, expect, it, vi } from "vitest";

const { getTenantAccess } = vi.hoisted(() => ({ getTenantAccess: vi.fn() }));
vi.mock("@/lib/security/tenant-access", () => ({ getTenantAccess }));

import { queueMdmCommand } from "@/modules/mdm/actions";

describe("queueMdmCommand", () => {
  it("refuses commands while MDM is disabled without checking or mutating access", async () => {
    const result = await queueMdmCommand(null, new FormData());

    expect(result).toEqual({ state: "disabled" });
    expect(getTenantAccess).not.toHaveBeenCalled();
  });
});
