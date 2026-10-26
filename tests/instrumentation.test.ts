import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequestError } from "../src/instrumentation";

describe("server request error logs", () => {
  afterEach(() => vi.restoreAllMocks());

  it("records route metadata without request data or error messages", () => {
    const output = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = Object.assign(new Error("identity=001-2345678-9 token=private"), { digest: "RSC_abc-123" });

    onRequestError(error, {
      path: "/clientes/customer-123?identity=001-2345678-9",
      method: "post",
      headers: { authorization: "Bearer private-token" },
    }, {
      routerKind: "App Router",
      routePath: "/app/clientes/[id]/page",
      routeType: "render",
      renderSource: "server-rendering",
      revalidateReason: undefined,
    });

    expect(output).toHaveBeenCalledOnce();
    const payload = JSON.parse(String(output.mock.calls[0][1])) as Record<string, unknown>;
    expect(payload).toMatchObject({
      event: "next.request_error",
      route: "/app/clientes/[id]/page",
      method: "POST",
      routeType: "render",
      errorName: "Error",
      hasDigest: true,
    });
    expect(JSON.stringify(payload)).not.toContain("001-2345678-9");
    expect(JSON.stringify(payload)).not.toContain("private-token");
    expect(JSON.stringify(payload)).not.toContain("customer-123");
    expect(JSON.stringify(payload)).not.toContain("RSC_abc-123");
  });

  it("normalizes malformed route values and omits unsafe digest values", () => {
    const output = vi.spyOn(console, "error").mockImplementation(() => undefined);

    onRequestError(Object.assign({}, { digest: "email@example.com" }), {
      path: "/?secret=value",
      method: "BREW",
      headers: {},
    }, {
      routerKind: "App Router",
      routePath: "/api/reports?secret=value",
      routeType: "route",
      renderSource: "server-rendering",
      revalidateReason: undefined,
    });

    const payload = JSON.parse(String(output.mock.calls[0][1])) as Record<string, unknown>;
    expect(payload.route).toBe("/api/reports");
    expect(payload.method).toBe("OTHER");
    expect(payload.hasDigest).toBe(true);
    expect(JSON.stringify(payload)).not.toContain("email@example.com");
    expect(JSON.stringify(payload)).not.toContain("secret=value");
  });
});
