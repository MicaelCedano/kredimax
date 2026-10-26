"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getTenantAccess } from "@/lib/security/tenant-access";
import { isValidImei, isValidImeiChange } from "@/lib/validation/imei";

const deviceFields = z.object({
  brand: z.string().trim().min(1).max(80),
  model: z.string().trim().min(1).max(120),
  serialNumber: z.string().trim().max(120).transform((value) => value || null),
  branchId: z.string().optional(),
});
const deviceCreateSchema = deviceFields.extend({
  imei: z.string().trim().regex(/^\d{15}$/, "El IMEI debe tener 15 dígitos.").refine(isValidImei, "El dígito de control del IMEI no es válido."),
});
const deviceUpdateSchema = deviceFields.extend({
  imei: z.string().trim().regex(/^(?:\d{15}|\d{20})$/, "El IMEI debe tener 15 dígitos; se permite conservar un valor histórico de 20 dígitos."),
});

function deviceValues(formData: FormData) {
  return {
    imei: String(formData.get("imei") ?? ""),
    brand: String(formData.get("brand") ?? ""),
    model: String(formData.get("model") ?? ""),
    serialNumber: String(formData.get("serialNumber") ?? ""),
    branchId: String(formData.get("branchId") ?? ""),
  };
}

function actionUrl(reason: string) {
  return `/dispositivos?estado=${encodeURIComponent(reason)}`;
}

export type DeviceActionState = { state: string } | null;

export async function createDevice(_previousState: DeviceActionState, formData: FormData): Promise<DeviceActionState> {
  const access = await getTenantAccess("devices.write");
  if (!access.ok) {
    if (access.reason === "unauthenticated") redirect("/login");
    return { state: access.reason };
  }

  const parsed = deviceCreateSchema.safeParse(deviceValues(formData));
  if (!parsed.success) return { state: "invalid" };
  const canChooseAnyBranch = access.membership.role === "tenant_admin";
  const branchId = canChooseAnyBranch ? parsed.data.branchId ?? "" : access.membership.branch_id ?? parsed.data.branchId ?? "";
  if (!z.string().uuid().safeParse(branchId).success || (!canChooseAnyBranch && access.membership.branch_id && parsed.data.branchId !== access.membership.branch_id)) return { state: "branch-required" };
  const { data: branch } = await access.supabase.from("branches").select("id").eq("tenant_id", access.membership.tenant_id).eq("id", branchId).maybeSingle();
  if (!branch) return { state: "branch-required" };

  const { error } = await access.supabase.from("devices").insert({
    tenant_id: access.membership.tenant_id,
    branch_id: branchId,
    imei: parsed.data.imei,
    brand: parsed.data.brand,
    model: parsed.data.model,
    serial_number: parsed.data.serialNumber,
  });

  if (error) return { state: error.code === "23505" ? "duplicate" : "save-error" };
  revalidatePath("/dispositivos");
  redirect(actionUrl("creado"));
}

export async function updateDevice(_previousState: DeviceActionState, formData: FormData): Promise<DeviceActionState> {
  const access = await getTenantAccess("devices.write");
  if (!access.ok) {
    if (access.reason === "unauthenticated") redirect("/login");
    return { state: access.reason };
  }

  const id = String(formData.get("id") ?? "");
  const parsed = deviceUpdateSchema.safeParse(deviceValues(formData));
  if (!z.string().uuid().safeParse(id).success || !parsed.success) return { state: "invalid" };
  const { data: target, error: targetError } = await access.supabase.from("devices")
    .select("branch_id,imei").eq("id", id).eq("tenant_id", access.membership.tenant_id).maybeSingle();
  if (targetError) return { state: "save-error" };
  if (!target) return { state: "not-found" };
  if (access.membership.role !== "tenant_admin" && access.membership.branch_id && target.branch_id !== access.membership.branch_id) return { state: "forbidden" };
  if (!isValidImeiChange(target.imei, parsed.data.imei)) return { state: "invalid" };

  const { data, error } = await access.supabase.from("devices").update({
    imei: parsed.data.imei,
    brand: parsed.data.brand,
    model: parsed.data.model,
    serial_number: parsed.data.serialNumber,
  }).eq("id", id).eq("tenant_id", access.membership.tenant_id).select("id").maybeSingle();

  if (error) return { state: error.code === "23505" ? "duplicate" : "save-error" };
  if (!data) return { state: "not-found" };
  revalidatePath("/dispositivos");
  revalidatePath(`/dispositivos/${id}`);
  redirect(actionUrl("actualizado"));
}
