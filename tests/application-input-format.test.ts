import { describe, expect, it } from "vitest";
import { formatIdentityInput, formatMoneyInput, formatPhoneInput, normalizeMoneyInput, uppercaseCustomerName } from "@/modules/financing/input-format";
import { parseMoneyToCents } from "@/modules/financing/calculator";

describe("application input formatting", () => {
  it("formats partial and pasted Dominican identities without altering other documents", () => {
    expect(formatIdentityInput("00112345678")).toBe("001-1234567-8");
    expect(formatIdentityInput("001-1234567-8")).toBe("001-1234567-8");
    expect(formatIdentityInput("0011")).toBe("001-1");
    expect(formatIdentityInput("0011234567")).toBe("001-1234567");
    expect(formatIdentityInput("PA1234567")).toBe("PA1234567");
    expect(formatIdentityInput("001123456789")).toBe("001123456789");
  });

  it("formats local phones and preserves international prefixes", () => {
    expect(formatPhoneInput("8095551234")).toBe("809-555-1234");
    expect(formatPhoneInput("(829) 555-1234")).toBe("829-555-1234");
    expect(formatPhoneInput("+18095551234")).toBe("+1-809-555-1234");
    expect(formatPhoneInput("+34915551234")).toBe("+34915551234");
    expect(formatPhoneInput("8095")).toBe("809-5");
  });

  it("groups money while keeping cent precision and unfinished decimal input", () => {
    expect(formatMoneyInput("35000.10")).toBe("35,000.10");
    expect(formatMoneyInput("45000.1", true)).toBe("45,000.10");
    expect(formatMoneyInput("45000", true)).toBe("45,000.00");
    expect(formatMoneyInput("35000.")).toBe("35,000.");
    expect(formatMoneyInput("35,000.01")).toBe("35,000.01");
    expect(formatMoneyInput("999999999999.99")).toBe("999,999,999,999.99");
    expect(parseMoneyToCents(normalizeMoneyInput("999,999,999,999.99"))).toBe(99999999999999n);
    expect(normalizeMoneyInput("35,000.")).toBe("35000");
    expect(normalizeMoneyInput("35,000.01")).toBe("35000.01");
    expect(() => parseMoneyToCents(normalizeMoneyInput("1,2"))).toThrow();
    expect(() => parseMoneyToCents(normalizeMoneyInput("35,000.001"))).toThrow();
    expect(() => parseMoneyToCents(normalizeMoneyInput("-1,000.00"))).toThrow();
  });

  it("uppercases Spanish names while preserving spaces and accents", () => {
    expect(uppercaseCustomerName("José María Núñez")).toBe("JOSÉ MARÍA NÚÑEZ");
  });
});
