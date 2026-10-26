const publicAuthRoutes = new Set(["/login", "/login/recover", "/auth/callback"]);

export function isPublicAuthRoute(pathname: string): boolean {
  return publicAuthRoutes.has(pathname);
}
