export function hasRecentRecovery(claims: { amr?: unknown } | null | undefined, now = Date.now()) {
  return Array.isArray(claims?.amr) && claims.amr.some((entry: unknown) => {
    if (!entry || typeof entry !== "object") return false;
    const method=entry as {method?:unknown;timestamp?:unknown};
    // GoTrue versions can record verified email recovery tokens as "otp".
    // Both require fresh email proof; a password-only session cannot reset here.
    return (method.method==="recovery" || method.method==="otp") && typeof method.timestamp==="number"
      && method.timestamp*1000<=now && now-method.timestamp*1000<=60*60*1000;
  });
}
