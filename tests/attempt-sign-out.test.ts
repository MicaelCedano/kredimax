import { describe, expect, it, vi } from "vitest";
import { attemptSignOut } from "../src/lib/auth/attempt-sign-out";

describe("attemptSignOut", () => {
  it("confirms navigation only when Auth returns no error", async () => {
    const signOut = vi.fn().mockResolvedValue({ error: null });
    await expect(attemptSignOut(signOut)).resolves.toBe(true);
    expect(signOut).toHaveBeenCalledOnce();
  });

  it("reports an unconfirmed close when Auth returns an error", async () => {
    const signOut = vi.fn().mockResolvedValue({ error: new Error("auth unavailable") });
    await expect(attemptSignOut(signOut)).resolves.toBe(false);
  });

  it("reports an unconfirmed close when Auth throws", async () => {
    const signOut = vi.fn().mockRejectedValue(new Error("network failure"));
    await expect(attemptSignOut(signOut)).resolves.toBe(false);
  });
});
