"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTenantAccess } from "@/lib/security/tenant-access";

const amount = z.string().regex(/^-?(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/);
const schema = z.object({
  branchId: z.uuid(), sellerId: z.uuid(), day: z.iso.date(),
  type: z.enum(["down_payment", "installment"]), cash: amount, transfer: amount, other: amount,
  notes: z.string().trim().max(1000),
});
export type CashActionState = { error?: string; saved?: boolean };

export async function closeCashDay(_previous: CashActionState, form: FormData): Promise<CashActionState> {
  const access = await getTenantAccess("cash.close");
  if (!access.ok) return { error: "Tu sesión o tu rol no permite cerrar esta caja." };
  const parsed = schema.safeParse(Object.fromEntries(["branchId", "sellerId", "day", "type", "cash", "transfer", "other", "notes"].map(key => [key, form.get(key)])));
  if (!parsed.success) return { error: "Revisa los importes (máximo dos decimales), la fecha y la observación." };
  const { error } = await access.supabase.rpc("close_cash_day", {
    p_tenant_id: access.membership.tenant_id, p_branch_id: parsed.data.branchId, p_seller_id: parsed.data.sellerId,
    p_day: parsed.data.day, p_type: parsed.data.type, p_cash: parsed.data.cash, p_transfer: parsed.data.transfer,
    p_other: parsed.data.other, p_notes: parsed.data.notes,
  });
  if (error) return { error: error.message.includes("CLOSING_DIFFERENCE_REASON_REQUIRED") ? "Hay diferencias por método. Explica el motivo antes de cerrar."
    : error.message.includes("CASH_ALREADY_CLOSED") ? "Esta caja ya está cerrada. Actualiza la página para consultar el cierre."
    : error.message.includes("FORBIDDEN") ? "No tienes permiso para cerrar esta caja."
    : "No se pudo cerrar la caja. Revisa la fecha e intenta nuevamente." };
  revalidatePath("/cajas");
  return { saved: true };
}
