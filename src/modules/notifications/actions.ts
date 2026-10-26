"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function markNotificationRead(formData: FormData) {
  const id = z.string().uuid().safeParse(String(formData.get("notificationId") ?? ""));
  if (!id.success) redirect("/notificaciones?estado=invalid");
  const supabase = await createSupabaseServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) redirect("/login");
  const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id.data).eq("user_id", userId);
  if (error) redirect("/notificaciones?estado=error");
  revalidatePath("/notificaciones");
  redirect("/notificaciones?estado=read");
}
