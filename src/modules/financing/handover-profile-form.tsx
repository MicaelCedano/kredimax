import { HomeLocationInput } from "@/components/forms/gps-location-input";
import { PreservedActionForm } from "@/components/forms/preserved-action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { completeHandoverProfile } from "@/modules/financing/handover-actions";
import type { HandoverProfile } from "@/modules/financing/handover-requirements";

export function HandoverProfileForm({ applicationId, profile }: { applicationId: string; profile: HandoverProfile }) {
  return <PreservedActionForm action={completeHandoverProfile} className="mt-5 flex flex-col gap-5" messages={{
    invalid: "Completa los seis datos obligatorios. Los teléfonos deben contener entre 7 y 15 dígitos; dirección y ubicación necesitan al menos 5 caracteres.",
    "reference-consent-required": "Confirma la autorización para registrar la ubicación y los datos de la referencia personal.",
    forbidden: "Tu rol no puede actualizar este expediente en la sucursal actual.",
    "not-pending": "La solicitud ya no está pendiente de entrega o no está disponible para tu usuario.",
    duplicate: "Ese documento ya pertenece a otro expediente. Revisa la identidad del cliente.",
    unavailable: "No se pudo verificar la solicitud. Tus datos se conservaron; vuelve a intentar.",
    "save-error": "No se pudieron guardar los datos. Se conservaron en el formulario; vuelve a intentar.",
  }}>
    <input type="hidden" name="applicationId" value={applicationId}/>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-medium text-secondary">Cédula o documento *<input name="identity_number" required minLength={3} maxLength={40} defaultValue={profile.identity_number ?? ""} autoComplete="off" className="km-input mt-2 w-full"/></label>
      <label className="text-sm font-medium text-secondary">Teléfono del cliente *<input name="phone" required type="tel" maxLength={40} defaultValue={profile.phone ?? ""} autoComplete="tel" className="km-input mt-2 w-full"/></label>
      <label className="text-sm font-medium text-secondary sm:col-span-2">Dirección de la vivienda *<textarea name="address" required minLength={5} maxLength={500} rows={2} defaultValue={profile.address ?? ""} autoComplete="street-address" className="km-input mt-2 w-full" placeholder="Calle, número, sector, municipio y provincia"/></label>
      <div className="sm:col-span-2"><HomeLocationInput name="home_location" required defaultValue={profile.home_location ?? ""} inputClass="mt-2 w-full"/><p className="mt-2 text-xs leading-5 text-muted">Pega el mapa, las coordenadas o una referencia precisa. El GPS actual pertenece al dispositivo que estás usando: úsalo solo si estás en la vivienda del cliente.</p></div>
    </div>
    <fieldset className="min-w-0 border-t border-line pt-4"><legend className="pr-3 text-sm font-semibold">Referencia personal obligatoria</legend><div className="mt-2 grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium text-secondary">Nombre de la referencia *<input name="reference_name" required minLength={2} maxLength={160} defaultValue={profile.reference_name ?? ""} autoComplete="off" className="km-input mt-2 w-full"/></label><label className="text-sm font-medium text-secondary">Teléfono de la referencia *<input name="reference_phone" required type="tel" maxLength={40} defaultValue={profile.reference_phone ?? ""} autoComplete="off" className="km-input mt-2 w-full"/></label></div></fieldset>
    <label className="flex items-start gap-3 text-xs leading-6 text-secondary"><input type="checkbox" name="referenceConsent" required className="mt-1.5 size-4 shrink-0"/><span>Confirmo que tengo autorización para registrar la ubicación de la vivienda y los datos de contacto de esta referencia personal.</span></label>
    <div><SubmitButton className="km-primary">Guardar datos para la entrega</SubmitButton></div>
  </PreservedActionForm>;
}
