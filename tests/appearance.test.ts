import { describe, expect, it } from "vitest";
import { parseAppearance, resolveAppearance } from "../src/lib/appearance";

describe("appearance preferences", () => {
  it("defaults missing and invalid persisted preferences to light", () => {
    for (const value of [null, "", "invalid"]) expect(parseAppearance(value)).toBe("light");
    expect(parseAppearance("system")).toBe("system");
    expect(parseAppearance("light")).toBe("light");
    expect(parseAppearance("dark")).toBe("dark");
  });
  it("follows the system only when the system option is explicitly selected", () => {
    expect(resolveAppearance("system", true)).toBe("dark");
    expect(resolveAppearance("system", false)).toBe("light");
    expect(resolveAppearance("light", true)).toBe("light");
    expect(resolveAppearance("dark", false)).toBe("dark");
  });
});
