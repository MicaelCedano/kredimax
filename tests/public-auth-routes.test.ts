import { describe, expect, it } from "vitest";
import { isPublicAuthRoute } from "../src/lib/auth/public-auth-routes";

describe("isPublicAuthRoute", () => {
  it.each(["/login", "/login/recover", "/auth/callback"])("allows unauthenticated auth route %s", (path) => {
    expect(isPublicAuthRoute(path)).toBe(true);
  });

  it.each(["/", "/clientes", "/login/recover/extra", "/auth/callback/extra", "/api/reportes"])("keeps protected route %s behind authentication", (path) => {
    expect(isPublicAuthRoute(path)).toBe(false);
  });
});
