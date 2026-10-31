import { z } from "zod";
import { formatIdentityInput, formatPhoneInput } from "@/modules/financing/input-format";

const phone = z.string().trim().max(40).transform(formatPhoneInput).refine((value) => /^[+\d\s().-]+$/.test(value) && /^\d{7,15}$/.test(value.replace(/\D/g, "")));
export const handoverProfileSchema = z.object({
  identity_number: z.string().trim().min(3).max(40).transform(formatIdentityInput),
  phone,
  address: z.string().trim().min(5).max(500),
  home_location: z.string().trim().min(5).max(500),
  reference_name: z.string().trim().min(2).max(160),
  reference_phone: phone,
});
export type HandoverProfile = { [K in keyof z.infer<typeof handoverProfileSchema>]: string | null };
export const handoverFields = [
  { key: "identity_number", label: "Cédula o documento" },
  { key: "phone", label: "Teléfono del cliente" },
  { key: "address", label: "Dirección de la vivienda" },
  { key: "home_location", label: "Ubicación de la vivienda" },
  { key: "reference_name", label: "Nombre de la referencia personal" },
  { key: "reference_phone", label: "Teléfono de la referencia personal" },
] as const;

export function missingHandoverFields(profile: Partial<HandoverProfile> | null | undefined) {
  return handoverFields.filter(({ key }) => !handoverProfileSchema.shape[key].safeParse(profile?.[key]).success);
}

export function isProvisionalActReference(value: string) {
  return /(?:borrador|provisional|ejemplo|draft)/i.test(value) || /\/solicitudes\/[^/]+\/acta(?:[/?#]|$)/i.test(value);
}
