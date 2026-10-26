import type { Instrumentation } from "next";

const safeErrorNames = new Set(["Error", "TypeError", "RangeError", "SyntaxError", "ReferenceError", "URIError", "EvalError"]);
const safeMethods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
const safeRouteTypes = new Set(["render", "route", "action", "proxy"]);

function safeRouteTemplate(value: string) {
  const route = value.split(/[?#]/, 1)[0] ?? "";
  return route.replace(/[^a-zA-Z0-9_$\[\]\/-]/g, "").slice(0, 160) || "unknown";
}

export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  const errorName = error instanceof Error && safeErrorNames.has(error.name) ? error.name : "Error";
  const digestValue = typeof error === "object" && error !== null && "digest" in error ? error.digest : undefined;
  const hasDigest = typeof digestValue === "string" && digestValue.length > 0 && digestValue.length <= 128;
  const method = safeMethods.has(request.method.toUpperCase()) ? request.method.toUpperCase() : "OTHER";
  const routeType = safeRouteTypes.has(context.routeType) ? context.routeType : "unknown";

  console.error("[kredimax:request-error]", JSON.stringify({
    event: "next.request_error",
    occurredAt: new Date().toISOString(),
    route: safeRouteTemplate(context.routePath),
    method,
    routeType,
    errorName,
    hasDigest,
  }));
};
