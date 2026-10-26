"use client";

import { useActionState, useId, useState } from "react";
import { SubmitButton } from "@/components/forms/submit-button";
import { Eye, EyeOff, KeyRound, Save, ShieldCheck, UserPlus } from "lucide-react";
import { usePreservedFormValues } from "@/components/forms/preserved-action-form";
import { changeOwnPassword, createTenantUser, updateOwnProfile } from "@/modules/account/actions";
import { operationalRoles } from "@/modules/account/roles";

const messages: Record<string,string> = {
  "invalid-name":"Escribe un nombre entre 2 y 200 caracteres.","save-error":"No se pudo guardar el nombre. Intenta de nuevo.",
  "invalid-password":"Las contraseñas nuevas deben coincidir y tener entre 12 y 256 caracteres.","same-password":"La contraseña nueva debe ser diferente de la actual.",
  "current-password-invalid":"La contraseña actual no es correcta.","password-save-error":"No se pudo cambiar la contraseña. Intenta de nuevo.",
  "invalid-user":"Revisa el nombre, correo, sucursal y rol. Las contraseñas deben coincidir y tener al menos 12 caracteres.",
  "invalid-branch":"Selecciona una sucursal activa de tu empresa.","email-exists":"Ese correo ya tiene una cuenta. No se cambió su contraseña ni su acceso.",
  "user-save-error":"No se pudo crear el usuario. Vuelve a escribir la contraseña e intenta de nuevo.",
  "provisioning-uncertain":"No se pudo confirmar el alta completa. Revisa la lista antes de volver a crear esta cuenta.",
  forbidden:"Solo el administrador de la empresa puede crear usuarios.",unavailable:"No se pudo consultar el servicio. Intenta más tarde.",
  "not-configured":"La creación de usuarios no está configurada en este servidor. Contacta al administrador del sistema.",
};

function ErrorMessage({state}:{state:{state:string}|null}) {
  return state && <p role="alert" className="rounded-xl border border-danger-line bg-danger-soft p-3 text-sm leading-6 text-danger">{messages[state.state] ?? "No se pudo completar la operación."}</p>;
}
function Field({label,children}:{label:string;children:React.ReactNode}) {
  return <label className="block text-sm font-semibold text-secondary">{label}{children}</label>;
}

export function ProfileForm({fullName}:{fullName:string}) {
  const [state,action,pending]=useActionState(updateOwnProfile,null);
  const {formRef,preserve}=usePreservedFormValues(state,["fullName"]);
  return <form ref={formRef} action={action} onSubmit={preserve} className="mt-6 space-y-5"><Field label="Nombre completo"><input required minLength={2} maxLength={200} name="fullName" autoComplete="name" defaultValue={fullName} className="km-input mt-2 w-full"/></Field><ErrorMessage state={state}/><SubmitButton disabled={pending} className="km-primary"><Save size={16} aria-hidden/>{pending ? "Guardando…" : "Guardar perfil"}</SubmitButton></form>;
}

export function ChangePasswordForm() {
  const [state,action,pending]=useActionState(changeOwnPassword,null);
  return <form action={action} className="mt-6 space-y-5"><Field label="Contraseña actual"><input required type="password" name="currentPassword" maxLength={256} autoComplete="current-password" className="km-input mt-2 w-full"/></Field><div className="grid gap-5 sm:grid-cols-2"><Field label="Contraseña nueva"><input required type="password" name="password" minLength={12} maxLength={256} autoComplete="new-password" className="km-input mt-2 w-full"/></Field><Field label="Confirmar contraseña nueva"><input required type="password" name="confirmation" minLength={12} maxLength={256} autoComplete="new-password" className="km-input mt-2 w-full"/></Field></div><p className="text-xs leading-5 text-muted">Usa al menos 12 caracteres. Después del cambio tendrás que iniciar sesión con la contraseña nueva.</p><ErrorMessage state={state}/><SubmitButton disabled={pending} className="km-primary"><KeyRound size={16} aria-hidden/>{pending ? "Actualizando…" : "Cambiar contraseña"}</SubmitButton></form>;
}

const roleDescriptions: Record<string, string> = {
  sales: "Puede registrar clientes, equipos y solicitudes en su sucursal. La aprobación requiere un encargado o administrador.",
  branch_manager: "Puede gestionar la operación y evaluar solicitudes dentro de su sucursal.",
  cashier: "Puede consultar y registrar cobros dentro de su sucursal.",
  collections: "Puede dar seguimiento a la cartera y registrar cobros de su sucursal.",
  auditor: "Puede consultar información y auditoría de su sucursal, sin registrar operaciones.",
};

function InitialPasswordField({ label, name }: { label: string; name: string }) {
  const [visible, setVisible] = useState(false);
  const id = useId();
  return <div><label htmlFor={id} className="text-sm font-medium text-secondary">{label}</label><div className="relative mt-2"><input id={id} required type={visible ? "text" : "password"} name={name} minLength={12} maxLength={256} autoComplete="new-password" className="km-input w-full pr-12"/><button type="button" aria-label={`${visible ? "Ocultar" : "Mostrar"} ${label.toLowerCase()}`} aria-pressed={visible} aria-controls={id} onClick={() => setVisible(value => !value)} className="absolute inset-y-0 right-1 grid w-10 place-items-center rounded-lg text-muted hover:text-accent">{visible ? <EyeOff size={18} aria-hidden/> : <Eye size={18} aria-hidden/>}</button></div></div>;
}

export function CreateUserForm({branches,defaultBranchId,onCancel}:{branches:{id:string;name:string}[];defaultBranchId:string;onCancel:()=>void}) {
  const [state,action,pending]=useActionState(createTenantUser,null);
  const [role, setRole] = useState("sales");
  const {formRef,preserve}=usePreservedFormValues(state,["fullName","email","role","branchId"]);
  return <form ref={formRef} action={action} onSubmit={preserve} data-pending={pending} className="flex min-h-0 flex-1 flex-col">
    <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-6 sm:px-7">
      <fieldset className="space-y-4"><legend className="mb-4 text-sm font-bold text-ink">Datos de acceso</legend>
        <Field label="Nombre completo"><input required name="fullName" minLength={2} maxLength={200} autoComplete="off" placeholder="Ej. Juan Pérez" className="km-input mt-2 w-full"/></Field>
        <Field label="Correo electrónico"><input required name="email" type="email" maxLength={254} autoComplete="off" placeholder="nombre@correo.com" className="km-input mt-2 w-full"/></Field>
      </fieldset>
      <fieldset className="border-t border-line pt-5"><legend className="float-left mb-4 w-full text-sm font-bold text-ink">Rol y sucursal</legend><div className="clear-both grid gap-4 sm:grid-cols-2">
        <Field label="Rol"><select name="role" required value={role} onChange={event=>setRole(event.target.value)} className="km-input mt-2 w-full">{Object.entries(operationalRoles).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></Field>
        <Field label="Sucursal"><select name="branchId" required defaultValue={defaultBranchId} className="km-input mt-2 w-full"><option value="" disabled>Selecciona una sucursal</option>{branches.map(branch=><option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></Field>
      </div></fieldset>
      <div className="space-y-4 border-t border-line pt-5"><InitialPasswordField label="Contraseña inicial" name="password"/><InitialPasswordField label="Confirmar contraseña" name="confirmation"/><p className="text-xs text-muted">Mínimo 12 caracteres. Podrá cambiarla desde Mi perfil.</p></div>
      <p className="flex items-start gap-2.5 rounded-xl bg-accent-soft p-3.5 text-xs leading-5 text-accent"><ShieldCheck size={18} className="mt-0.5 shrink-0" aria-hidden/>{roleDescriptions[role]}</p>
      <ErrorMessage state={state}/>
    </div>
    <footer className="flex shrink-0 items-center justify-end gap-3 border-t border-line bg-surface px-5 py-4 sm:px-7"><button type="button" onClick={onCancel} disabled={pending} className="km-secondary disabled:opacity-50">Cancelar</button><SubmitButton type="submit" disabled={pending || !branches.length} className="km-primary"><UserPlus size={17} aria-hidden/>{pending ? "Creando…" : "Crear usuario"}</SubmitButton></footer>
  </form>;
}
