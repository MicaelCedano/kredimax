export const IDLE_NAVIGATION_MS = 60_000;
export const SLOW_NAVIGATION_MS = 12_000;

export function isIdleNavigation(lastActivity: number, now: number) {
  return now - lastActivity >= IDLE_NAVIGATION_MS;
}

export function openFreshDocument(href: string) {
  // Recovery intentionally bypasses the client router and always issues a GET.
  window.location.assign(new URL(href, window.location.href).href);
}

// Only follow ordinary, local GET links. Never replay a form or payment action.
export function navigationDestination(href: string, currentHref: string) {
  try {
    const current = new URL(currentHref);
    const target = new URL(href, current);
    if (!/^https?:$/.test(target.protocol) || target.origin !== current.origin) return null;
    if (target.pathname === "/api" || target.pathname.startsWith("/api/") || target.pathname.startsWith("/_next/") || /\.[a-z0-9]{2,8}$/i.test(target.pathname)) return null;
    if (target.pathname === current.pathname && target.search === current.search) return null;
    return target.href;
  } catch {
    return null;
  }
}
