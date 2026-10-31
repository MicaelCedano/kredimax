"use client";

import Link from "next/link";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionState, useState } from "react";
import { Check, MapPin, Pencil, Plus, Save, Search, ShieldCheck, UserPlus, Users } from "lucide-react";
import { usePreservedFormValues } from "@/components/forms/preserved-action-form";
import { CreateUserForm } from "@/modules/account/forms";
import { accountRoles } from "@/modules/account/roles";
import { UserDrawer } from "@/modules/account/user-drawer";
import { updateMembership } from "@/modules/tenant/actions";

export type DirectoryMember = { id: string; user_id: string; full_name: string; email: string | null; branch_id: string | null; role: string; status: string };
type Branch = { id: string; name: string; active: boolean };
type WorkspaceProps = {
  members: DirectoryMember[]; branches: Branch[]; count: number; page: number; pages: number;
  currentUserId: string; defaultBranchId: string; directoryError: boolean; branchError: boolean;
};

const editMessages: Record<string, string> = {
  invalid: "Revisa el rol, la sucursal y el estado.",
  "scope-required": "Los roles operativos requieren una sucursal.",
  forbidden: "No tienes permiso para modificar este usuario.",
  "save-error": "No se pudo guardar. No puedes suspender o quitar el rol al último administrador activo.",
};

function displayLoginIdentifier(email: string | null) {
  if (!email) return "Sin usuario registrado";
  if (email.endsWith("@kredimax.com")) {
    return `Usuario: ${email.replace("@kredimax.com", "")}`;
  }
  return email;
}

function MembershipEditForm({ member, branches, onCancel }: { member: DirectoryMember; branches: Branch[]; onCancel: () => void }) {
  const [state, action, pending] = useActionState(updateMembership, null);
  const { formRef, preserve } = usePreservedFormValues(state, ["role", "branchId", "status"]);
  return <form ref={formRef} action={action} onSubmit={preserve} data-pending={pending} className="flex min-h-0 flex-1 flex-col">
    <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-6 sm:px-7">
      <div className="rounded-xl bg-subtle p-4"><p className="font-semibold text-ink">{member.full_name}</p><p className="mt-1 break-all text-sm text-muted">{displayLoginIdentifier(member.email)}</p></div>
      <input type="hidden" name="membershipId" value={member.id}/>
      <label className="block text-sm font-medium text-secondary">Rol<select name="role" defaultValue={member.role} required className="km-input mt-2 block w-full">{Object.entries(accountRoles).filter(([role]) => role !== "platform_admin").map(([role, label]) => <option key={role} value={role}>{label}</option>)}</select></label>
      <label className="block text-sm font-medium text-secondary">Sucursal<select name="branchId" defaultValue={member.branch_id ?? ""} className="km-input mt-2 block w-full"><option value="">Todas las sucursales (administrador)</option>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}{branch.active ? "" : " · Inactiva"}</option>)}</select></label>
      <label className="block text-sm font-medium text-secondary">Estado<select name="status" defaultValue={member.status} className="km-input mt-2 block w-full"><option value="active">Activo</option><option value="suspended">Suspendido</option></select></label>
      <p className="flex items-start gap-2.5 rounded-xl bg-accent-soft p-3.5 text-xs leading-5 text-accent"><ShieldCheck size={18} className="mt-0.5 shrink-0" aria-hidden/>El administrador tiene acceso a toda la empresa. Los demás roles trabajan en la sucursal asignada.</p>
      {state && <p role="alert" className="rounded-xl border border-danger-line bg-danger-soft p-3 text-sm leading-6 text-danger">{editMessages[state.state] ?? "No se pudieron actualizar los permisos. Intenta de nuevo."}</p>}
    </div>
    <footer className="flex shrink-0 justify-end gap-3 border-t border-line bg-surface px-5 py-4 sm:px-7"><button type="button" onClick={onCancel} disabled={pending} className="km-secondary disabled:opacity-50">Cancelar</button><SubmitButton type="submit" disabled={pending} className="km-primary"><Save size={16} aria-hidden/>{pending ? "Guardando…" : "Guardar permisos"}</SubmitButton></footer>
  </form>;
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "U";
}
function searchable(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es");
}

export function UsersWorkspace({ members, branches, count, page, pages, currentUserId, defaultBranchId, directoryError, branchError }: WorkspaceProps) {
  const [drawer, setDrawer] = useState<"new" | DirectoryMember | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const activeBranches = branches.filter(branch => branch.active);
  const term = searchable(query.trim());
  const filtered = members.filter(member => (status === "all" || member.status === status) && searchable(`${member.full_name} ${member.email ?? ""}`).includes(term));
  const dismiss = () => setDrawer(null);

  return <>
    <div className="mb-7 flex flex-wrap items-end justify-between gap-5 sm:mb-8"><div><h1 className="km-page-title">Usuarios</h1><p className="mt-2 text-sm leading-6 text-muted">Gestiona el acceso y los permisos de tu equipo.</p></div><button type="button" onClick={() => setDrawer("new")} disabled={branchError} aria-haspopup="dialog" className="km-primary shadow-[0_4px_12px_rgb(18_100_220/.14)]"><Plus size={18} aria-hidden/>Nuevo usuario</button></div>

    <section aria-labelledby="team-directory-heading" className="km-panel overflow-hidden">
      <div className="px-5 pb-5 pt-6 sm:px-7"><div className="flex flex-wrap items-center gap-3"><h2 id="team-directory-heading" className="text-lg font-bold tracking-[-.35px] text-ink">Equipo de trabajo</h2><span className="rounded-md bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent">{count} {count === 1 ? "persona" : "personas"}</span></div>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row"><div className="relative w-full sm:max-w-md"><Search size={18} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"/><input type="search" aria-label={pages > 1 ? "Buscar usuarios en esta página" : "Buscar por nombre o correo"} placeholder={pages > 1 ? "Buscar usuarios en esta página" : "Buscar por nombre o correo"} value={query} onChange={event => setQuery(event.target.value)} className="km-input w-full pl-11"/></div><select aria-label="Filtrar usuarios por estado" value={status} onChange={event => setStatus(event.target.value)} className="km-input sm:w-48"><option value="all">Todos los estados</option><option value="active">Activos</option><option value="suspended">Suspendidos</option></select></div>
      </div>

      {directoryError || branchError ? <p role="alert" className="mx-5 mb-6 rounded-xl bg-warning-soft p-4 text-sm text-warning sm:mx-7">No se pudo cargar {directoryError ? "el directorio de usuarios" : "la lista de sucursales"}. Recarga la página para volver a intentar.</p> : <>
        <div aria-hidden className="mx-5 hidden grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.2fr)_100px_80px] items-center gap-4 rounded-lg bg-subtle px-4 py-3 text-[11px] font-semibold uppercase tracking-[.06em] text-muted sm:mx-7 xl:grid"><span>Persona</span><span>Rol</span><span>Sucursal</span><span>Estado</span><span/></div>
        <ul className="min-h-[260px] divide-y divide-line px-5 sm:px-7" aria-label="Usuarios de la empresa">
          {filtered.map(member => <li key={member.id} className="relative grid gap-x-4 gap-y-4 py-6 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.2fr)_100px_80px] xl:items-center xl:px-4">
            <div className="flex min-w-0 items-center gap-3 pr-20 sm:col-span-2 xl:col-span-1 xl:pr-0"><span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-[#edf4ff] text-sm font-semibold text-accent">{initials(member.full_name)}</span><div className="min-w-0"><h3 className="break-words text-sm font-semibold text-ink">{member.full_name}</h3><p title={member.email ?? undefined} className="mt-1 truncate text-xs text-muted">{displayLoginIdentifier(member.email)}</p>{member.user_id === currentUserId && <span className="mt-1.5 inline-block rounded-md bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">Tu cuenta</span>}</div></div>
            <div className="flex min-w-0 items-center gap-2 text-sm text-secondary"><ShieldCheck size={17} className="shrink-0 text-muted" aria-hidden/><span>{accountRoles[member.role] ?? member.role}</span></div>
            <div className="flex min-w-0 items-center gap-2 text-sm text-secondary"><MapPin size={16} className="shrink-0 text-muted xl:hidden" aria-hidden/><span>{member.role === "tenant_admin" ? "Todas las sucursales" : branches.find(branch => branch.id === member.branch_id)?.name ?? "Sin sucursal"}</span></div>
            <span className={`inline-flex w-fit items-center gap-2 text-xs font-medium ${member.status === "active" ? "text-positive" : "text-warning"}`}><span aria-hidden className={`size-2 rounded-full ${member.status === "active" ? "bg-positive-soft0" : "bg-warning-soft0"}`}/>{member.status === "active" ? "Activo" : "Suspendido"}</span>
            <button type="button" aria-label={`Editar permisos de ${member.full_name}`} aria-haspopup="dialog" onClick={() => setDrawer(member)} className="absolute right-0 top-5 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 text-xs font-semibold text-accent transition-colors hover:bg-accent-soft xl:static"><Pencil size={15} aria-hidden/>Editar</button>
          </li>)}
          {!filtered.length && <li className="flex min-h-[260px] flex-col items-center justify-center py-10 text-center"><span className="mb-3 grid size-12 place-items-center rounded-full bg-subtle text-muted"><Users size={22} aria-hidden/></span><h3 className="text-sm font-semibold text-ink">{members.length ? "No hay coincidencias" : "Tu equipo empieza aquí"}</h3><p className="mt-1 max-w-xs text-sm leading-6 text-muted">{members.length ? "Prueba con otro nombre, correo o estado." : "Crea un usuario y asígnale su rol y sucursal."}</p>{members.length > 0 && <button type="button" onClick={() => { setQuery(""); setStatus("all"); }} className="mt-3 text-sm font-semibold text-accent">Limpiar filtros</button>}</li>}
        </ul>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-4 sm:px-7"><p className="flex items-start gap-2 text-xs leading-5 text-muted"><ShieldCheck size={17} className="mt-0.5 shrink-0" aria-hidden/>Cada persona trabaja con los permisos de su rol y sucursal.</p><p aria-live="polite" className="text-xs text-muted">{query || status !== "all" ? `${filtered.length} de ${members.length} en esta página` : ""}</p></div>
      </>}
      {pages > 1 && <nav aria-label="Paginación de usuarios" className="flex items-center justify-between border-t border-line px-5 py-4 text-xs sm:px-7"><Link aria-disabled={page <= 1} tabIndex={page <= 1 ? -1 : undefined} className={page <= 1 ? "pointer-events-none text-muted" : "font-semibold text-accent"} href={`/usuarios?page=${Math.max(1, page - 1)}`}>Anterior</Link><span>Página {page} de {pages}</span><Link aria-disabled={page >= pages} tabIndex={page >= pages ? -1 : undefined} className={page >= pages ? "pointer-events-none text-muted" : "font-semibold text-accent"} href={`/usuarios?page=${Math.min(pages, page + 1)}`}>Siguiente</Link></nav>}
    </section>

    {drawer && <UserDrawer title={drawer === "new" ? "Nuevo usuario" : "Editar permisos"} description={drawer === "new" ? "Un acceso propio para cada persona." : "Define el acceso de esta persona a tu empresa."} icon={drawer === "new" ? UserPlus : ShieldCheck} onDismiss={dismiss}>
      {drawer === "new" ? <CreateUserForm branches={activeBranches} defaultBranchId={defaultBranchId} onCancel={dismiss}/> : <MembershipEditForm member={drawer} branches={branches} onCancel={dismiss}/>}
    </UserDrawer>}
  </>;
}

export function UsersSuccessNotice({ state }: { state?: string }) {
  if (!state || !["creado", "actualizado"].includes(state)) return null;
  return <p role="status" className="mb-6 flex items-start gap-2.5 rounded-xl border border-positive-line bg-positive-soft px-4 py-3 text-sm leading-6 text-positive"><Check size={18} className="mt-0.5 shrink-0" aria-hidden/>{state === "creado" ? "Usuario creado. Ya puede iniciar sesión con su correo y contraseña inicial." : "Los permisos del usuario se actualizaron correctamente."}</p>;
}
