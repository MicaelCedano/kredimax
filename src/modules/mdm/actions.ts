"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getTenantAccess } from "@/lib/security/tenant-access";
import { MDM_COMMANDS_ENABLED } from "./config";

const commandSchema = z.object({
  deviceId: z.string().uuid(),
  commandType: z.enum(["sync_status", "lock", "unlock"]),
  confirmed: z.literal("yes"),
});

export type MdmActionState = { state: string } | null;

export async function queueMdmCommand(_previousState: MdmActionState, formData: FormData): Promise<MdmActionState> {
  if (!MDM_COMMANDS_ENABLED) return { state: "disabled" };

  const access = await getTenantAccess("mdm.command");
  if (!access.ok) {
    if (access.reason === "unauthenticated") redirect("/login");
    return { state: "forbidden" };
  }
  const parsed = commandSchema.safeParse({
    deviceId: String(formData.get("deviceId") ?? ""),
    commandType: String(formData.get("commandType") ?? ""),
    confirmed: String(formData.get("confirmed") ?? ""),
  });
  if (!parsed.success) return { state: "invalid" };

  const { data: device } = await access.supabase.from("devices")
    .select("id,branch_id").eq("id", parsed.data.deviceId)
    .eq("tenant_id", access.membership.tenant_id).maybeSingle();
  if (!device || (access.membership.role !== "tenant_admin" && access.membership.branch_id && device.branch_id !== access.membership.branch_id)) {
    return { state: "forbidden" };
  }

  const { error } = await access.supabase.from("mdm_commands").insert({
    tenant_id: access.membership.tenant_id,
    device_id: parsed.data.deviceId,
    command_type: parsed.data.commandType,
    status: "queued",
    requested_by: access.userId,
    confirmation_at: new Date().toISOString(),
    provider_response: { mode: "local_mock", dispatched: false },
  });
  if (error) return { state: "save-error" };
  revalidatePath("/mdm");
  redirect("/mdm?estado=queued");
}
