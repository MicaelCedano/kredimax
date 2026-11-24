import { redirect } from "next/navigation";
import { Building2, KeyRound, ShieldCheck, Store, UserRound } from "lucide-react";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ProfileForm, ChangePasswordForm } from "@/modules/account/forms";

const roleLabels: Record<string, string> = {
  tenant_admin: "Administrador",
  branch_manager: "Encargado de sucursal",
  sales: "Ventas",
  cashier: "Caja",
  collections: "Cobros",
  auditor: "Auditoría",
  mdm_operator: "Programador MDM",
  platform_admin: "Administrador de plataforma",
};

export default async function ProfilePage({searchParams}:{searchParams:Promise<{estado?:string}>}) {
  const client=await createSupabaseServerClient();
  const [{data,error},{estado}]=await Promise.all([client.auth.getUser(),searchParams]);
  if (error || !data.user) redirect("/login");
  const user=data.user;
  const fullName=String(user.user_metadata?.full_name ?? user.user_metadata?.name ?? "");

  const { data: memberships } = await client
    .from("tenant_memberships")
    .select("tenant_id,branch_id,role,status")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  const primaryMembership = memberships?.[0] ?? null;
  const [{ data: tenant }, { data: branch }] = await Promise.all([
    primaryMembership?.tenant_id
      ? client.from("tenants").select("name,legal_name,currency,timezone,status").eq("id", primaryMembership.tenant_id).maybeSingle()
      : Promise.resolve({ data: null }),
    primaryMembership?.branch_id
      ? client.from("branches").select("name,code").eq("id", primaryMembership.branch_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const companyName = tenant?.name ?? "Sin empresa asignada";
  const legalName = tenant?.legal_name || companyName;
  const branchLabel = primaryMembership?.role === "tenant_admin"
    ? branch ? `${branch.name} · Acceso a todas las sucursales` : "Todas las sucursales"
    : branch?.name ?? "Sin sucursal asignada";
  const roleLabel = primaryMembership ? (roleLabels[primaryMembership.role] ?? primaryMembership.role) : "Sin rol asignado";

  return <div className="min-h-screen bg-canvas"><Sidebar/><Topbar key={user.updated_at}/><main id="main-content" tabIndex={-1} className="km-main px-4 pb-10 pt-7 sm:px-7 lg:ml-[244px]"><div className="mb-7"><h1 className="km-page-title">Mi perfil</h1><p className="mt-2 text-sm text-muted">Consulta los datos de tu empresa, actualiza tu nombre y administra tu contraseña de acceso.</p></div>{estado==="actualizado" && <p role="status" className="mb-5 rounded-xl border border-positive-line bg-positive-soft p-4 text-sm text-positive">Tu perfil se actualizó correctamente.</p>}<div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]"><div className="space-y-5"><section className="km-panel min-w-0 p-5 sm:p-6"><h2 className="flex items-center gap-2 text-base font-bold"><UserRound size={19} className="text-accent" aria-hidden/>Información personal</h2><div className="mt-5 rounded-xl bg-subtle p-4"><p className="text-xs text-muted">Correo de acceso</p><p className="mt-1 break-all text-sm font-medium text-secondary">{user.email}</p></div><ProfileForm fullName={fullName}/></section><section className="km-panel min-w-0 p-5 sm:p-6"><h2 className="flex items-center gap-2 text-base font-bold"><Building2 size={19} className="text-accent" aria-hidden/>Datos de la empresa</h2><p className="mt-1.5 text-xs text-muted">Organización, sucursal y rol asociados a tu perfil.</p><dl className="mt-5 grid gap-4 border-t border-line pt-4 text-sm sm:grid-cols-2"><div className="flex gap-3"><Building2 size={16} className="mt-0.5 shrink-0 text-muted" aria-hidden/><div><dt className="text-xs text-muted">Empresa</dt><dd className="mt-1 font-semibold text-ink">{companyName}</dd>{legalName !== companyName && <dd className="text-xs text-muted">{legalName}</dd>}</div></div><div className="flex gap-3"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-muted" aria-hidden/><div><dt className="text-xs text-muted">Rol en la empresa</dt><dd className="mt-1 font-semibold text-ink">{roleLabel}</dd></div></div><div className="flex gap-3 sm:col-span-2"><Store size={16} className="mt-0.5 shrink-0 text-muted" aria-hidden/><div><dt className="text-xs text-muted">Sucursal asignada</dt><dd className="mt-1 font-medium text-secondary">{branchLabel}</dd></div></div></dl></section></div><section className="km-panel min-w-0 p-5 sm:p-6"><h2 className="flex items-center gap-2 text-base font-bold"><KeyRound size={19} className="text-accent" aria-hidden/>Cambiar contraseña</h2><p className="mt-2 text-sm leading-6 text-muted">Confirma tu contraseña actual para establecer una nueva.</p><ChangePasswordForm/></section></div></main></div>;
}
