"use client";

import { Bell, LogOut, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MobileNavigation } from "@/components/dashboard/mobile-navigation";
import { CompanyContext } from "@/components/dashboard/company-context";
import { SearchBox } from "@/components/dashboard/search-box";
import { AppearanceControl } from "@/components/ui/appearance-control";
import { BrandLogo } from "@/components/ui/brand-logo";
import { loadAllPages } from "@/lib/pagination/load-all-pages";
import { branchIdsForMemberships } from "@/lib/auth/session-branches";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { attemptSignOut } from "@/lib/auth/attempt-sign-out";
import { useNavigationAccess } from "@/components/dashboard/navigation-context";

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

export function Topbar() {
  const [tenantChoices, setTenantChoices] = useState<{ id: string; name: string; branchId: string | null; branchName: string | null; role: string }[]>([]);
  const [selectedTenant, setSelectedTenant] = useState("");
  const [name, setName] = useState("Cuenta");
  const [role, setRole] = useState("Usuario");
  const [organization, setOrganization] = useState("Empresa");
  const [branch, setBranch] = useState("Sucursal");
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const router = useRouter();
  const { can, setAccess } = useNavigationAccess();
  const [rolePermissions, setRolePermissions] = useState<Record<string, string[]> | null>(null);

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || !active) return;

        const metadataName = user.user_metadata?.full_name ?? user.user_metadata?.name;
        const emailName = user.email?.split("@")[0]?.replace(/[._-]+/g, " ").trim();
        const displayName = typeof metadataName === "string" && metadataName.trim()
          ? metadataName.trim()
          : emailName
            ? emailName.replace(/\b\p{L}/gu, (letter) => letter.toLocaleUpperCase("es-DO"))
            : "Cuenta";
        const pageSize = 500;
        const memberships = await loadAllPages<{ tenant_id: string; branch_id: string | null; role: string }>(async (from, to) =>
          await supabase
            .from("tenant_memberships")
            .select("tenant_id,branch_id,role")
            .eq("user_id", user.id)
            .eq("status", "active")
            .order("tenant_id")
            .range(from, to), pageSize);

        if (!active) return;
        setName(displayName);
        const activeMemberships = memberships ?? [];
        const tenantIds = [...new Set(activeMemberships.map((membership) => membership.tenant_id))];
        const branchIds = branchIdsForMemberships(activeMemberships);
        const [{ data: tenants }, { data: branches }, permissionResult] = await Promise.all([
          tenantIds.length ? supabase.from("tenants").select("id,name").in("id", tenantIds) : Promise.resolve({ data: [] }),
          branchIds.length ? supabase.from("branches").select("id,name").in("id", branchIds) : Promise.resolve({ data: [] }),
          supabase.from("roles").select("key,role_permissions(permissions(key))").in("key", [...new Set(activeMemberships.map((membership) => membership.role))]),
        ]);
        if (!active) return;
        const tenantNames = new Map((tenants ?? []).map((tenant) => [tenant.id, tenant.name]));
        const branchNames = new Map((branches ?? []).map((branchRow) => [branchRow.id, branchRow.name]));
        const choices = activeMemberships.map((membership) => ({
          id: membership.tenant_id,
          name: tenantNames.get(membership.tenant_id) ?? "Empresa",
          branchId: membership.branch_id,
          branchName: membership.role === "tenant_admin" ? "Todas las sucursales" : branchNames.get(membership.branch_id ?? "") ?? (membership.branch_id ? "Sucursal" : "Todas las sucursales"),
          role: membership.role,
        }));
        setTenantChoices(choices);
        const permissionMap: Record<string, string[]> = {};
        if (!permissionResult.error) {
          for (const row of permissionResult.data ?? []) {
            permissionMap[row.key] = row.role_permissions.flatMap((grant) => {
              const values = Array.isArray(grant.permissions) ? grant.permissions : [grant.permissions];
              return values.filter((value) => value && typeof value.key === "string").map((value) => value.key);
            });
          }
          setRolePermissions(permissionMap);
        }
        const cookieSelection = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("kredimax_tenant="))?.slice("kredimax_tenant=".length);
        const selected = choices.find((choice) => choice.id === cookieSelection) ?? (choices.length === 1 ? choices[0] : null);
        if (selected) {
          setSelectedTenant(selected.id);
          setRole(roleLabels[selected.role] ?? "Usuario");
          setOrganization(selected.name);
          setBranch(selected.branchName);
          if (!permissionResult.error && permissionMap[selected.role]) setAccess({ role: selected.role, permissions: permissionMap[selected.role] });
        } else if (choices.length > 1) {
          setOrganization("Selecciona empresa");
          setBranch("Contexto no seleccionado");
        }
      } catch {
        // Keep a neutral account label if the local Auth service is unavailable.
      }
    }

    void loadProfile();
    return () => { active = false; };
  }, [setAccess]);

  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase("es-DO") || "U";
  const selectTenant = (tenantId: string) => {
    const choice = tenantChoices.find((item) => item.id === tenantId);
    setSelectedTenant(tenantId);
    setOrganization(choice?.name ?? "Selecciona empresa");
    setBranch(choice?.branchName ?? "Contexto no seleccionado");
    setRole(choice ? roleLabels[choice.role] ?? "Usuario" : "Usuario");
    setAccess(choice && rolePermissions?.[choice.role] ? { role: choice.role, permissions: rolePermissions[choice.role] } : null);
    document.cookie = `kredimax_tenant=${encodeURIComponent(tenantId)}; Path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    router.refresh();
  };

  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutError("");
    try {
      const supabase = createSupabaseBrowserClient();
      const confirmed = await attemptSignOut(() => supabase.auth.signOut());
      if (!confirmed) {
        setSignOutError("No se pudo confirmar el cierre de sesión. Revisa tu acceso y vuelve a intentar.");
        router.refresh();
        return;
      }
      router.replace("/login");
      router.refresh();
    } catch {
      setSignOutError("No se pudo completar el cierre de sesión. Verifica la conexión y vuelve a intentar.");
    } finally {
      setSigningOut(false);
    }
  };

  return <>
    <header className="km-topbar sticky top-0 z-20 flex h-[72px] items-center justify-between gap-3 px-3 sm:px-7 lg:ml-[244px]">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3"><MobileNavigation tenantChoices={tenantChoices} selectedTenant={selectedTenant} selectedContext={{ organization, branch, role }} onTenantChange={selectTenant}/><Link href="/" prefetch={false} aria-label="KrediMax inicio" className="md:hidden"><BrandLogo className="!w-[110px]"/></Link><SearchBox/></div>
      <div className="flex min-w-0 shrink-0 items-center gap-1 sm:gap-3">
        <CompanyContext tenantChoices={tenantChoices} selectedTenant={selectedTenant} organization={organization} branch={branch} onTenantChange={selectTenant}/>
        {signOutError && <span role="alert" className="max-w-32 text-[10px] leading-4 text-danger sm:max-w-48 sm:text-xs">{signOutError}</span>}
        {can("financing.write") && <Link href="/solicitudes/nueva" prefetch={false} className="km-icon-button km-quick-action" aria-label="Nueva solicitud" title="Nueva solicitud"><Plus size={20} aria-hidden/></Link>}
        <Link aria-label="Notificaciones" title="Notificaciones" href="/notificaciones" prefetch={false} className="km-icon-button"><Bell size={18}/></Link>
        <AppearanceControl/>
        <Link href="/perfil" prefetch={false} title="Mi perfil y contraseña" className="flex items-center gap-2.5 rounded-lg py-1 pl-1 text-left transition-colors hover:bg-subtle" aria-label={`Mi perfil. Cuenta de ${name}. Rol: ${role}. Empresa: ${organization}. Sucursal: ${branch}.`}>
          <span aria-hidden="true" className="grid size-9 place-items-center rounded-full bg-accent-soft text-[12px] font-semibold text-accent">{initials}</span>
          <span className="hidden 2xl:block"><span className="block max-w-40 truncate text-sm font-semibold leading-5 text-ink">{name}</span><span className="block max-w-48 truncate text-xs text-muted">{role} · {organization}</span></span>
        </Link>
        <button type="button" onClick={signOut} disabled={signingOut} aria-busy={signingOut} aria-label="Cerrar sesión" title={signingOut ? "Cerrando sesión…" : "Cerrar sesión"} className="km-icon-button disabled:cursor-wait disabled:opacity-60"><LogOut size={17}/></button>
      </div>
    </header>
  </>;
}
