import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";

export type TenantMembership = {
  tenant_id: string;
  branch_id: string | null;
  role: string;
};

export async function getTenantAccess(permission: string) {
  let supabase;
  try { supabase = await createSupabaseServerClient(); }
  catch { return { ok: false as const, reason: "unavailable" as const }; }
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return { ok: false as const, reason: "unauthenticated" as const };

  const selectedTenantId = (await cookies()).get("kredimax_tenant")?.value;
  let membership: TenantMembership | null = null;
  if (selectedTenantId) {
    const { data, error } = await supabase
      .from("tenant_memberships")
      .select("tenant_id, branch_id, role")
      .eq("user_id", userId)
      .eq("status", "active")
      .eq("tenant_id", selectedTenantId)
      .maybeSingle();
    if (error) return { ok: false as const, reason: "unavailable" as const };
    membership = data as TenantMembership | null;
  }
  if (!membership) {
    const { data: memberships, error } = await supabase
      .from("tenant_memberships")
      .select("tenant_id, branch_id, role")
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(2);
    if (error) return { ok: false as const, reason: "unavailable" as const };
    if (!memberships?.length) return { ok: false as const, reason: "no-membership" as const };
    if (memberships.length > 1) return { ok: false as const, reason: "tenant-selection-required" as const };
    membership = memberships[0] as TenantMembership;
  }
  const { data: tenant, error: tenantError } = await supabase.from("tenants").select("status").eq("id", membership.tenant_id).maybeSingle();
  if (tenantError) return { ok: false as const, reason: "unavailable" as const };
  if (!tenant || tenant.status !== "active") return { ok: false as const, reason: "tenant-suspended" as const };
  const [{ data: roleRow, error: roleError }, { data: permissionRow, error: permissionError }] = await Promise.all([
    supabase.from("roles").select("id").eq("key", membership.role).maybeSingle(),
    supabase.from("permissions").select("id").eq("key", permission).maybeSingle(),
  ]);

  if (roleError || permissionError) return { ok: false as const, reason: "unavailable" as const };
  if (!roleRow || !permissionRow) return { ok: false as const, reason: "forbidden" as const };

  const { data: grant, error: grantError } = await supabase
    .from("role_permissions")
    .select("role_id")
    .eq("role_id", roleRow.id)
    .eq("permission_id", permissionRow.id)
    .maybeSingle();

  if (grantError) return { ok: false as const, reason: "unavailable" as const };
  if (!grant) return { ok: false as const, reason: "forbidden" as const };

  return { ok: true as const, supabase, userId, membership };
}
