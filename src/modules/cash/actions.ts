"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTenantAccess } from "@/lib/security/tenant-access";

const targetSchema = z.object({ branchId: z.uuid(), sellerId: z.uuid(), day: z.iso.date() });
const openSchema = targetSchema.omit({ sellerId: true });
const amount = z.string().regex(/^-?(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/);
const receiptAmount = z.string().regex(/^-?(?:0|[1-9]\d{0,12})(?:\.\d{1,2})?$/);
const notes = z.string().trim().max(1000);
const countFields = ["cash", "transfer", "other", "notes"] as const;
const countSchema = z.object({ cash: amount, transfer: amount, other: amount, notes });
const receiptSchema = z.object({ cash: receiptAmount, transfer: receiptAmount, other: receiptAmount, notes });
const paymentTypes = ["down_payment", "installment"] as const;

export type CashActionState = { error?: string; saved?: boolean };

function finishCashAction(error: { message: string } | null, fallback: string): CashActionState {
  if (error) {
    const messages = {
      FORBIDDEN: "Tu cuenta no tiene permiso para esta caja.",
      INVALID_DAY: "Solo puedes abrir la caja del día actual.",
      CASH_OPEN_REQUIRED: "Abre tu caja antes de cerrar y entregar el cuadre.",
      CASH_ALREADY_CLOSED: "Esta caja tiene un cierre guardado. Actualiza la página.",
      CASH_ALREADY_DELIVERED: "El cuadre ya fue entregado. Actualiza la página.",
      CASH_REVIEW_REQUIRED: "Los cierres pendientes cambiaron. Actualiza la página y vuelve a verificar los importes.",
      DRAWER_NOT_FOUND: "No se encontró la caja para esa fecha.",
      CASH_NOT_DELIVERED: "Primero se debe entregar el cuadre.",
      CASH_SELF_RECEIPT: "La recepción debe confirmarla otra persona autorizada.",
      CASH_ALREADY_RECEIVED: "La recepción ya está registrada. Actualiza la página.",
      CLOSING_DIFFERENCE_REASON_REQUIRED: "Explica las diferencias de cada cierre antes de entregar el cuadre.",
      RECEIPT_DIFFERENCE_REASON_REQUIRED: "Explica la diferencia entre lo declarado y lo recibido.",
    };
    const match = Object.entries(messages).find(([code]) => error.message.includes(code));
    return { error: match?.[1] ?? fallback };
  }
  revalidatePath("/cajas");
  return { saved: true };
}

export async function openCashDrawer(_previous: CashActionState, form: FormData): Promise<CashActionState> {
  const access = await getTenantAccess("cash.close");
  if (!access.ok) return { error: "Tu sesión o tu rol no permite abrir esta caja." };
  const parsed = openSchema.safeParse({ branchId: form.get("branchId"), day: form.get("day") });
  if (!parsed.success) return { error: "Revisa la sucursal y la fecha." };
  const { error } = await access.supabase.rpc("open_cash_drawer", {
    p_tenant_id: access.membership.tenant_id, p_branch_id: parsed.data.branchId, p_day: parsed.data.day,
  });
  return finishCashAction(error, "No se pudo abrir la caja.");
}

export async function deliverCashDrawer(_previous: CashActionState, form: FormData): Promise<CashActionState> {
  const access = await getTenantAccess("cash.close");
  if (!access.ok) return { error: "Tu sesión o tu rol no permite cerrar esta caja." };
  const target = targetSchema.safeParse(Object.fromEntries(["branchId", "sellerId", "day"].map(key => [key, form.get(key)])));
  const counts = z.partialRecord(z.enum(paymentTypes), countSchema).safeParse(Object.fromEntries(
    paymentTypes.filter(type => form.has(`${type}-cash`)).map(type => [
      type, Object.fromEntries(countFields.map(field => [field, form.get(`${type}-${field}`)])),
    ]),
  ));
  if (!target.success || !counts.success) return { error: "Revisa los importes, la fecha y las observaciones." };
  const { error } = await access.supabase.rpc("deliver_cash_drawer", {
    p_tenant_id: access.membership.tenant_id, p_branch_id: target.data.branchId,
    p_seller_id: target.data.sellerId, p_day: target.data.day, p_counts: counts.data,
  });
  return finishCashAction(error, "No se pudo cerrar y entregar el cuadre.");
}

export async function receiveCashDrawer(_previous: CashActionState, form: FormData): Promise<CashActionState> {
  const access = await getTenantAccess("cash.receive");
  if (!access.ok) return { error: "Tu sesión o tu rol no permite recibir este cuadre." };
  const target = targetSchema.safeParse(Object.fromEntries(["branchId", "sellerId", "day"].map(key => [key, form.get(key)])));
  const receipt = receiptSchema.safeParse(Object.fromEntries(countFields.map(key => [key, form.get(key)])));
  if (!target.success || !receipt.success) return { error: "Revisa los importes recibidos y la observación." };
  const { error } = await access.supabase.rpc("receive_cash_drawer", {
    p_tenant_id: access.membership.tenant_id, p_branch_id: target.data.branchId,
    p_seller_id: target.data.sellerId, p_day: target.data.day, p_cash: receipt.data.cash,
    p_transfer: receipt.data.transfer, p_other: receipt.data.other, p_notes: receipt.data.notes,
  });
  return finishCashAction(error, "No se pudo confirmar la recepción.");
}
