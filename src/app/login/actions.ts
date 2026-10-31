"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { hasRecentRecovery } from "@/lib/auth/recovery-session";

export type LoginActionState = { state: string } | null;

function isLocalSupabaseUrl(): boolean {
  try {
    const host = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname;
    return host === "127.0.0.1" || host === "localhost" || host === "::1";
  } catch {
    return false;
  }
}

function resolveLoginEmail(identifier: string): string | null {
  const normalized = identifier.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "admin") {
    return (
      process.env.KREDIMAX_ADMIN_EMAIL?.trim() ||
      process.env.KREDIMAX_LOCAL_ADMIN_EMAIL?.trim() ||
      "admin@kredimax.com"
    );
  }
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return normalized;
  }
  const clean = normalized.replace(/[^a-z0-9._-]/g, "");
  return clean ? `${clean}@kredimax.com` : null;
}

export async function signIn(_previousState: LoginActionState, formData: FormData): Promise<LoginActionState> {
  if (!isSupabaseConfigured) return { state: "not-configured" };
  const identifier = String(formData.get("identifier") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const email = resolveLoginEmail(identifier);
  if (!email || email.length > 254 || !password || password.length > 256) return { state: "invalid" };
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      const serviceUnavailable = error.status === 0 || (typeof error.status === "number" && error.status >= 500);
      return { state: serviceUnavailable ? "unavailable" : "credentials" };
    }
  } catch {
    return { state: "unavailable" };
  }
  redirect("/");
}

export async function requestPasswordReset(_previousState: LoginActionState, formData: FormData): Promise<LoginActionState> {
  if (!isSupabaseConfigured) return { state: "not-configured" };
  const identifier = String(formData.get("identifier") ?? "").trim();
  const email = resolveLoginEmail(identifier);
  if (!email || email.length > 254) return { state: "invalid" };
  const supabase = await createSupabaseServerClient();
  const redirectTo = new URL("/auth/callback?next=/login/recover", process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").toString();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) return { state: "recovery-unavailable" };
  redirect("/login?error=recovery-sent");
}

export async function updatePassword(formData: FormData) {
  if (!isSupabaseConfigured) redirect("/login?error=not-configured");
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");
  if (password.length < 12 || password.length > 256 || password !== confirmation) redirect("/login/recover?error=invalid");
  const supabase = await createSupabaseServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!hasRecentRecovery(claims?.claims)) redirect("/login?error=recovery-invalid");
  const { error } = await supabase.auth.updateUser({ password });
  if (error) redirect("/login/recover?error=save");
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login?error=password-updated");
}
