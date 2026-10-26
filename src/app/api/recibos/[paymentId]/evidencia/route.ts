import { getTenantAccess } from "@/lib/security/tenant-access";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
export async function GET(_request: Request, { params }: { params: Promise<{ paymentId: string }> }) {
  const { paymentId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(paymentId)) return new Response(null, { status: 404, headers });
  const access = await getTenantAccess("payments.read");
  if (!access.ok) return new Response(null, { status: access.reason === "unauthenticated" ? 401 : 403, headers });
  const { data, error } = await access.supabase.from("payment_evidence").select("image_data").eq("tenant_id", access.membership.tenant_id).eq("payment_id", paymentId).maybeSingle();
  if (error) return new Response(null, { status: 503, headers });
  if (!data) return new Response(null, { status: 404, headers });
  const bytes = Buffer.from(String(data.image_data).replace(/^\\x/, ""), "hex");
  return new Response(new Uint8Array(bytes), { headers: { ...headers, "Content-Type": "image/webp", "Content-Length": String(bytes.length) } });
}
