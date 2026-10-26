import { describe, expect, it } from "vitest";
import { IDLE_NAVIGATION_MS, isIdleNavigation, navigationDestination } from "../src/lib/navigation/recovery";

describe("Navigation recovery", () => {
  it("uses a fresh document only after the inactivity threshold", () => {
    expect(isIdleNavigation(1000, 1000 + IDLE_NAVIGATION_MS - 1)).toBe(false);
    expect(isIdleNavigation(1000, 1000 + IDLE_NAVIGATION_MS)).toBe(true);
    expect(isIdleNavigation(1000, 999)).toBe(false);
  });
  it("allows local GET routes and preserves query parameters", () => {
    expect(navigationDestination("/solicitudes?page=2", "http://127.0.0.1:3001/usuarios")).toBe("http://127.0.0.1:3001/solicitudes?page=2");
  });
  it("ignores external links, scripts and same-page anchors", () => {
    const current = "http://127.0.0.1:3001/usuarios";
    expect(navigationDestination("https://example.com/", current)).toBeNull();
    expect(navigationDestination("javascript:alert(1)", current)).toBeNull();
    expect(navigationDestination("#equipo", current)).toBeNull();
    expect(navigationDestination(current, current)).toBeNull();
  });
  it("leaves report downloads and static assets outside route recovery", () => {
    const current = "http://127.0.0.1:3001/reportes";
    expect(navigationDestination("/api/reportes?format=payments", current)).toBeNull();
    expect(navigationDestination("/contrato.pdf", current)).toBeNull();
    expect(navigationDestination("/_next/static/app.js", current)).toBeNull();
  });
});
