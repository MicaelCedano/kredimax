"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient, isUserProvisioningConfigured } from "@/lib/supabase/admin";
import { getTenantAccess } from "@/lib/security/tenant-access";

export type AccountActionState = { state: string } | null;
const value = (form: FormData, name: string) => typeof form.get(name) === "string" ? String(form.get(name)) : "";

export async function updateOwnProfile(_previous: AccountActionState, form: FormData): Promise<AccountActionState> {
  const parsed = z.string().trim().min(2).max(200).safeParse(value(form,"fullName"));
  if (!parsed.success) return {state:"invalid-name"};
  const client = await createSupabaseServerClient();
  const {data,error} = await client.auth.getUser();
  if (error || !data.user) redirect("/login");
  const updated = await client.auth.updateUser({data:{full_name:parsed.data}});
  if (updated.error) return {state:"save-error"};
  revalidatePath("/perfil");
  redirect("/perfil?estado=actualizado");
}

export async function changeOwnPassword(_previous: AccountActionState, form: FormData): Promise<AccountActionState> {
  const current = value(form,"currentPassword"), password = value(form,"password"), confirmation = value(form,"confirmation");
  if (!current || current.length>256 || password.length<12 || password.length>256 || password!==confirmation) return {state:"invalid-password"};
  if (current===password) return {state:"same-password"};
  const client = await createSupabaseServerClient();
  const {data,error} = await client.auth.getUser();
  if (error || !data.user?.email) redirect("/login");
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL, key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return {state:"unavailable"};
  const verifier=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  try {
    const verified=await verifier.auth.signInWithPassword({email:data.user.email,password:current});
    if (verified.error) return {state:verified.error.status && verified.error.status>=500 ? "unavailable" : "current-password-invalid"};
    if (verified.data.user?.id!==data.user.id) return {state:"current-password-invalid"};
    const updated=await verifier.auth.updateUser({password,current_password:current});
    if (updated.error) return {state:"password-save-error"};
  } finally {
    // This short-lived verification session never replaces the browser's cookies.
    await verifier.auth.signOut({scope:"local"});
  }
  await client.auth.signOut({scope:"local"});
  redirect("/login?error=password-updated");
}

const userSchema=z.object({
  fullName:z.string().trim().min(2).max(200),
  email:z.string().trim().min(2).max(254).transform(s => {
    const val = s.toLowerCase();
    return val.includes("@") ? val : `${val.replace(/[^a-z0-9._-]/g, "")}@kredimax.com`;
  }),
  password:z.string().min(6).max(256),confirmation:z.string(),branchId:z.string().uuid(),
  role:z.enum(["sales","branch_manager","cashier","collections","auditor","mdm_operator"]),
}).refine(s=>s.password===s.confirmation);

export async function createTenantUser(_previous: AccountActionState, form: FormData): Promise<AccountActionState> {
  const access=await getTenantAccess("tenant.manage");
  if (!access.ok || access.membership.role!=="tenant_admin") return {state:"forbidden"};
  const parsed=userSchema.safeParse(Object.fromEntries(["fullName","email","password","confirmation","branchId","role"].map(name=>[name,value(form,name)])));
  if (!parsed.success) return {state:"invalid-user"};
  const branch=await access.supabase.from("branches").select("id").eq("id",parsed.data.branchId).eq("tenant_id",access.membership.tenant_id).eq("active",true).maybeSingle();
  if (branch.error) return {state:"unavailable"};
  if (!branch.data) return {state:"invalid-branch"};
  if (!isUserProvisioningConfigured()) return {state:"not-configured"};
  const admin=createSupabaseAdminClient();
  const rawEmailInput = value(form, "email").trim();
  const metadata: Record<string, string> = { full_name: parsed.data.fullName };
  if (!rawEmailInput.includes("@")) {
    metadata.username = rawEmailInput.toLowerCase();
  }
  const created=await admin.auth.admin.createUser({email:parsed.data.email,password:parsed.data.password,email_confirm:true,
    user_metadata:metadata,app_metadata:{kredimax_created_for_tenant:access.membership.tenant_id,kredimax_created_by:access.userId}});
  if (created.error || !created.data.user) return {state:created.error?.code==="email_exists" || created.error?.code==="user_already_exists" ? "email-exists" : "user-save-error"};
  const userId=created.data.user.id;
  const provisioned=await admin.rpc("provision_tenant_user",{p_tenant_id:access.membership.tenant_id,p_actor_id:access.userId,p_user_id:userId,p_role:parsed.data.role,p_branch_id:parsed.data.branchId});
  if (provisioned.error) {
    // A lost response may follow a commit. Never delete an account with a membership.
    const existing=await admin.from("tenant_memberships").select("id,tenant_id,branch_id,role").eq("user_id",userId).maybeSingle();
    if (existing.data?.tenant_id===access.membership.tenant_id && existing.data.branch_id===parsed.data.branchId && existing.data.role===parsed.data.role) {
      revalidatePath("/usuarios"); redirect("/usuarios?estado=creado");
    }
    if (existing.error || existing.data || !provisioned.error.code) return {state:"provisioning-uncertain"};
    const cleanup=await admin.auth.admin.deleteUser(userId);
    if (cleanup.error) return {state:"provisioning-uncertain"};
    return {state:"user-save-error"};
  }
  revalidatePath("/usuarios");
  redirect("/usuarios?estado=creado");
}
