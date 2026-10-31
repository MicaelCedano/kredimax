"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getTenantAccess } from "@/lib/security/tenant-access";
import type { PreservedFormState } from "@/components/forms/preserved-action-form";
import { handoverFields, handoverProfileSchema } from "@/modules/financing/handover-requirements";
import { loadHandoverContext } from "@/modules/financing/handover-context.server";

export async function completeHandoverProfile(_previous: PreservedFormState, formData: FormData): Promise<PreservedFormState> {
  const applicationId = String(formData.get("applicationId") ?? "");
  const parsed = handoverProfileSchema.safeParse(Object.fromEntries(handoverFields.map(({ key }) => [key, String(formData.get(key) ?? "")])));
  if (!z.string().uuid().safeParse(applicationId).success || !parsed.success) return { state: "invalid" };
  if (formData.get("referenceConsent") !== "on") return { state: "reference-consent-required" };
  const [read, write] = await Promise.all([getTenantAccess("financing.read"), getTenantAccess("customers.write")]);
  if (!read.ok || !write.ok || read.membership.tenant_id !== write.membership.tenant_id) return { state: "forbidden" };
  let context;
  try { context = await loadHandoverContext(applicationId, read); }
  catch { return { state: "unavailable" }; }
  if (!context || context.loan.status !== "approved") return { state: "not-pending" };
  if (write.membership.role !== "tenant_admin" && write.membership.branch_id !== context.customer.branch_id) return { state: "forbidden" };

  // A partial, explicit update: never null out employment, income, consent,
  // verification, branch, approved terms, or any other customer fields.
  const { data, error } = await write.supabase.from("customers").update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("tenant_id", write.membership.tenant_id).eq("id", context.customer.id).select("id").maybeSingle();
  if (error) return { state: error.code === "23505" ? "duplicate" : "save-error" };
  if (!data) return { state: "not-pending" };
  revalidatePath(`/clientes/${context.customer.id}`);
  revalidatePath("/clientes");
  revalidatePath(`/solicitudes/${applicationId}`);
  revalidatePath(`/solicitudes/${applicationId}/entrega`);
  revalidatePath(`/solicitudes/${applicationId}/acta`);
  redirect(`/solicitudes/${applicationId}/entrega?estado=datos-completados`);
}
