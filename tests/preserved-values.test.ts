import { describe, expect, it } from "vitest";
import { snapshotFormData } from "../src/components/forms/preserved-values";

describe("snapshotFormData", () => {
  it("preserves only whitelisted login fields and never retains the password", () => {
    const formData = new FormData();
    formData.set("email", "persona@example.test");
    formData.set("password", "secret-test-only");

    expect(snapshotFormData(formData, ["email"])).toEqual({ email: ["persona@example.test"] });
  });

  it("retains repeated values such as checked options in their original order", () => {
    const formData = new FormData();
    formData.append("permission", "customers.read");
    formData.append("permission", "payments.read");
    formData.append("upload", new Blob(["private-test-file"]), "private.txt");

    expect(snapshotFormData(formData)).toEqual({ permission: ["customers.read", "payments.read"] });
  });
});
