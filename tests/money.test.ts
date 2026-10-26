import { describe, expect, it } from "vitest";
import { money } from "../src/lib/navigation";
import { centsToDecimal, decimalToCents, formatDop, formatDopCents } from "../src/lib/format-money";

describe("money", () => {
  it("always shows the currency symbol and two decimal places", () => {
    expect(money(48_250_000).replaceAll(/\s/g, "")).toBe("RD$48,250,000.00");
  });

  it("preserves centavos when an amount has them", () => {
    expect(money(1_234.5).replaceAll(/\s/g, "")).toBe("RD$1,234.50");
    expect(formatDop(1_234.5).replaceAll(/\s/g, "")).toBe("RD$1,234.50");
  });

  it("formats statement and reversal amounts with exact decimal arithmetic", () => {
    expect(formatDop("999999999999.99").replaceAll(/\s/g, "")).toBe("RD$999,999,999,999.99");
    expect(formatDopCents(decimalToCents("12.35") - decimalToCents("20.00")).replaceAll(/\s/g, "")).toBe("−RD$7.65");
    expect(centsToDecimal(decimalToCents("12.35") - decimalToCents("2.30"))).toBe("10.05");
  });

  it("rejects malformed database money values instead of rounding them", () => {
    expect(() => formatDop("1.001")).toThrow("Importe DOP inválido");
    expect(() => formatDop(Number.NaN)).toThrow("Importe DOP inválido");
  });
});
