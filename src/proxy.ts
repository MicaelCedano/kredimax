import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isPublicAuthRoute } from "@/lib/auth/public-auth-routes";

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return NextResponse.next({ request });
  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values, headers) {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
      },
    },
  });
  const pathname = request.nextUrl.pathname;
  const isLogin = pathname === "/login";
  const hasSupabaseSessionCookie = request.cookies.getAll().some(({ name }) =>
    /^sb-.+-auth-token(?:\.\d+)?$/i.test(name),
  );

  // Public auth pages must render without waiting on Supabase. Proxy is a fast
  // routing layer; only check claims when a session cookie may need validation.
  if (isPublicAuthRoute(pathname) && !hasSupabaseSessionCookie) {
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }

  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub && !isPublicAuthRoute(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    const redirect = NextResponse.redirect(loginUrl);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }
  if (claims?.sub && isLogin) {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/";
    const redirect = NextResponse.redirect(homeUrl);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
