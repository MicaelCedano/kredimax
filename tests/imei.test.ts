import { describe, expect, it } from "vitest";
import { imeiValidationMessage, isValidImei, isValidImeiChange } from "../src/lib/validation/imei";

describe("IMEI 15-digit validation", () => {
  it("accepts any 15-digit numeric IMEI regardless of check digit", () => {
    expect(isValidImei("490154203237518")).toBe(true);
    expect(isValidImei("359293857383452")).toBe(true);
  });

  it("rejects non-numeric values and invalid lengths for new writes", () => {
    expect(isValidImei("49015420323751X")).toBe(false);
    expect(isValidImei("12345678901234567890")).toBe(false);
    expect(isValidImei("12345678901234")).toBe(false);
  });

  it("allows preserving an unchanged legacy IMEI and accepts any 15-digit replacement", () => {
    const legacy = "12345678901234567890";
    expect(isValidImeiChange(legacy, legacy)).toBe(true);
    expect(isValidImeiChange(legacy, "490154203237518")).toBe(true);
    expect(isValidImeiChange(legacy, "359293857383452")).toBe(true);
    expect(isValidImeiChange(legacy, "12345678901234")).toBe(false);
  });

  it("returns an error message only when the IMEI does not have 15 digits", () => {
    expect(imeiValidationMessage("359293857383452")).toBeUndefined();
    expect(imeiValidationMessage("23231231321321")).toContain("15 dígitos");
    expect(imeiValidationMessage("490154203237518")).toBeUndefined();
  });
});
