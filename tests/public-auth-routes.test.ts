import { describe, expect, it } from "vitest";
import { isPublicAuthRoute, isPublicRoute } from "../src/lib/auth/public-auth-routes";

describe("isPublicAuthRoute", () => {
  it.each(["/login", "/login/recover", "/auth/callback"])("allows unauthenticated auth route %s", (path) => {
    expect(isPublicAuthRoute(path)).toBe(true);
  });

  it.each(["/", "/clientes", "/login/recover/extra", "/auth/callback/extra", "/api/reportes"])("keeps protected route %s behind authentication", (path) => {
    expect(isPublicAuthRoute(path)).toBe(false);
  });
});

describe("isPublicRoute", () => {
  it.each(["/acerca", "/privacidad", "/condiciones", "/login"])("allows public page %s", (path) => {
    expect(isPublicRoute(path)).toBe(true);
  });

  it.each(["/privacidad/extra", "/solicitudes/nueva", "/api/solicitudes/example/documentos/file"])("protects %s", (path) => {
    expect(isPublicRoute(path)).toBe(false);
  });
});
