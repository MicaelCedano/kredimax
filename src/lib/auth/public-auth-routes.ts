const publicAuthRoutes = new Set(["/login", "/login/recover", "/auth/callback"]);
const publicInfoRoutes = new Set(["/acerca", "/privacidad", "/condiciones"]);

export function isPublicAuthRoute(pathname: string): boolean {
  return publicAuthRoutes.has(pathname);
}

export function isPublicRoute(pathname: string): boolean {
  return isPublicAuthRoute(pathname) || publicInfoRoutes.has(pathname);
}
