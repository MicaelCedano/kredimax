"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTenantAccess } from "@/lib/security/tenant-access";
import { provisionCustomerPortalCredentials } from "@/lib/security/customer-portal-auth";

export type CustomerPortalProvisionState = {
  ok?: boolean;
  error?: string;
  maskedCedula?: string;
  temporaryPassword?: string;
} | null;

const provisionSchema = z.object({
  customerId: z.string().uuid(),
  executiveName: z.string().trim().max(160).optional(),
  executiveWhatsapp: z.string().trim().max(32).optional(),
});

export async function provisionCustomerPortalAccessAction(
  _previousState: CustomerPortalProvisionState,
  formData: FormData,
): Promise<CustomerPortalProvisionState> {
  const access = await getTenantAccess("customers.write");
  if (!access.ok) {
    return {
      ok: false,
      error:
        access.reason === "unauthenticated"
          ? "Tu sesión expiró. Inicia sesión nuevamente."
          : "No tienes permisos para administrar el acceso móvil de clientes.",
    };
  }

  const parsed = provisionSchema.safeParse({
    customerId: String(formData.get("customerId") ?? ""),
    executiveName: String(formData.get("executiveName") ?? "").trim() || undefined,
    executiveWhatsapp: String(formData.get("executiveWhatsapp") ?? "").trim() || undefined,
  });

  if (!parsed.success) {
    return { ok: false, error: "Identificador de cliente inválido." };
  }

  const { data: customer, error: customerError } = await access.supabase
    .from("customers")
    .select("id, branch_id, full_name, identity_number, created_by_name")
    .eq("tenant_id", access.membership.tenant_id)
    .eq("id", parsed.data.customerId)
    .maybeSingle();

  if (customerError || !customer) {
    return { ok: false, error: "No se encontró el expediente del cliente en tu alcance." };
  }

  if (
    access.membership.role !== "tenant_admin" &&
    access.membership.branch_id &&
    customer.branch_id !== access.membership.branch_id
  ) {
    return { ok: false, error: "No tienes autorización para esta sucursal." };
  }

  if (!customer.identity_number) {
    return {
      ok: false,
      error: "Registra primero la cédula de 11 dígitos del cliente en su expediente antes de generar el acceso móvil.",
    };
  }

  const result = await provisionCustomerPortalCredentials({
    tenantId: access.membership.tenant_id,
    actorId: access.userId,
    customerId: customer.id,
    identityNumber: customer.identity_number,
    fullName: customer.full_name,
    executiveName: parsed.data.executiveName || customer.created_by_name || null,
    executiveWhatsapp: parsed.data.executiveWhatsapp || null,
  });

  if (!result.ok) {
    return { ok: false, error: result.message };
  }

  revalidatePath(`/clientes/${customer.id}`);
  return {
    ok: true,
    maskedCedula: result.maskedCedula,
    temporaryPassword: result.temporaryPassword,
  };
}
