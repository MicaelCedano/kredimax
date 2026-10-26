import "server-only";
import { createClient } from "@supabase/supabase-js";

export function isUserProvisioningConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
}

export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) throw new Error("User provisioning is not configured");
  return createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}
