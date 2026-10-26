import { redirect } from "next/navigation";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { getTenantAccess } from "@/lib/security/tenant-access";
import { createSupabaseAdminClient, isUserProvisioningConfigured } from "@/lib/supabase/admin";
import { UsersSuccessNotice, UsersWorkspace, type DirectoryMember } from "@/modules/account/users-workspace";

type Directory = { count: number; rows: DirectoryMember[] };

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ page?: string; estado?: string }> }) {
  const [access, query] = await Promise.all([getTenantAccess("tenant.manage"), searchParams]);
  if (!access.ok && access.reason === "unauthenticated") redirect("/login");
  const allowed = access.ok && access.membership.role === "tenant_admin";
  const configured = isUserProvisioningConfigured();
  const page = Math.max(1, Math.min(100000, Number.parseInt(query.page ?? "1", 10) || 1));
  const [directory, branchResult] = allowed ? await Promise.all([
    configured ? createSupabaseAdminClient().rpc("tenant_user_directory", { p_tenant_id: access.membership.tenant_id, p_actor_id: access.userId, p_page: page, p_page_size: 50 }) : Promise.resolve({ data: null, error: null }),
    access.supabase.from("branches").select("id,name,active").eq("tenant_id", access.membership.tenant_id).order("name"),
  ]) : [{ data: null, error: null }, { data: [], error: null }];
  const data = directory.data as Directory | null;
  const branches = branchResult.data ?? [];
  const activeBranches = branches.filter(branch => branch.active);
  const pages = Math.max(1, Math.ceil((data?.count ?? 0) / 50));

  return <div className="min-h-screen bg-canvas">
    <Sidebar/><Topbar/>
    <main id="main-content" tabIndex={-1} className="km-main px-4 pb-10 pt-7 sm:px-7 lg:ml-[244px] lg:pt-8">
      {!allowed || !configured ? <>
        <h1 className="km-page-title mb-7">Usuarios</h1>
        <p role="alert" className="rounded-xl border border-warning-line bg-warning-soft p-5 text-sm text-warning">{!allowed ? "Solo el administrador de la empresa puede crear usuarios o administrar sus permisos." : "La administración de usuarios requiere completar la configuración privada del servidor."}</p>
      </> : <>
        <UsersSuccessNotice state={query.estado}/>
        <UsersWorkspace key={`${page}-${query.estado ?? ""}`} members={data?.rows ?? []} branches={branches} count={data?.count ?? 0} page={page} pages={pages} currentUserId={access.userId}
          defaultBranchId={activeBranches.find(branch => branch.id === access.membership.branch_id)?.id ?? (activeBranches.length === 1 ? activeBranches[0].id : "")}
          directoryError={Boolean(directory.error)} branchError={Boolean(branchResult.error)}/>
      </>}
    </main>
  </div>;
}
