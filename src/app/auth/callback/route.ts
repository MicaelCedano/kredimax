import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/login?error=recovery-invalid", request.url));
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return NextResponse.redirect(new URL("/login?error=recovery-invalid", request.url));
    return NextResponse.redirect(new URL("/login/recover", request.url));
  } catch {
    return NextResponse.redirect(new URL("/login?error=not-configured", request.url));
  }
}
