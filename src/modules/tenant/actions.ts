"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getTenantAccess } from "@/lib/security/tenant-access";

const schema = z.object({
  membershipId: z.string().uuid(),
  role: z.enum(["tenant_admin", "branch_manager", "sales", "cashier", "collections", "auditor", "mdm_operator"]),
  branchId: z.union([z.string().uuid(), z.literal("")]),
  status: z.enum(["active", "suspended"]),
});

export type TenantActionState = { state: string } | null;

export async function updateMembership(_previousState: TenantActionState, formData: FormData): Promise<TenantActionState> {
  const access = await getTenantAccess("tenant.manage");
  if (!access.ok) {
    if (access.reason === "unauthenticated") redirect("/login");
    return { state: "forbidden" };
  }
  const parsed = schema.safeParse({
    membershipId: String(formData.get("membershipId") ?? ""),
    role: String(formData.get("role") ?? ""),
    branchId: String(formData.get("branchId") ?? ""),
    status: String(formData.get("status") ?? ""),
  });
  if (!parsed.success) return { state: "invalid" };
  const { error } = await access.supabase.rpc("manage_tenant_membership", {
    p_membership_id: parsed.data.membershipId,
    p_role: parsed.data.role,
    p_branch_id: parsed.data.branchId || null,
    p_status: parsed.data.status,
  });
  if (error) return { state: error.code === "23514" ? "scope-required" : error.message.includes("FORBIDDEN") ? "forbidden" : "save-error" };
  revalidatePath("/usuarios");
  revalidatePath("/");
  redirect("/usuarios?estado=actualizado");
}

const branchSchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{1,19}$/),
});

export async function createTenantBranch(_previousState: TenantActionState, formData: FormData): Promise<TenantActionState> {
  const access = await getTenantAccess("branches.manage");
  if (!access.ok) {
    if (access.reason === "unauthenticated") redirect("/login");
    return { state: "forbidden" };
  }
  const parsed = branchSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    code: String(formData.get("code") ?? ""),
  });
  if (!parsed.success) return { state: "invalid" };
  const { error } = await access.supabase.rpc("create_tenant_branch", {
    p_tenant_id: access.membership.tenant_id,
    p_name: parsed.data.name,
    p_code: parsed.data.code,
  });
  if (error) return { state: error.message.includes("BRANCH_CODE_TAKEN") ? "duplicate" : error.message.includes("FORBIDDEN") ? "forbidden" : "save-error" };
  revalidatePath("/sucursales");
  revalidatePath("/usuarios");
  revalidatePath("/clientes");
  revalidatePath("/dispositivos");
  revalidatePath("/solicitudes/nueva");
  redirect("/sucursales?estado=creada");
}
