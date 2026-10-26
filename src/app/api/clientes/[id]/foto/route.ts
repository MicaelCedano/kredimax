import { getTenantAccess } from "@/lib/security/tenant-access";
import { revalidatePath } from "next/cache";
import { isSameOriginPhotoRequest, MAX_PHOTO_UPLOAD_BYTES, prepareCustomerPhoto } from "@/modules/customers/photo";

export const runtime = "nodejs";
const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
type Context = { params: Promise<{ id: string }> };
const validId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

export async function GET(_request: Request, { params }: Context) {
  const { id } = await params;
  if (!validId(id)) return new Response(null, { status: 404, headers: privateHeaders });
  const access = await getTenantAccess("customers.read");
  if (!access.ok) return new Response(null, { status: access.reason === "unauthenticated" ? 401 : 403, headers: privateHeaders });
  const { data, error } = await access.supabase.from("customer_photos").select("image_data,content_type")
    .eq("tenant_id", access.membership.tenant_id).eq("customer_id", id).maybeSingle();
  if (error) return new Response(null, { status: 503, headers: privateHeaders });
  if (!data) return new Response(null, { status: 404, headers: privateHeaders });
  const bytes = Buffer.from(String(data.image_data).replace(/^\\x/, ""), "hex");
  return new Response(new Uint8Array(bytes), { headers: { ...privateHeaders, "Content-Type": "image/webp", "Content-Length": String(bytes.length) } });
}

export async function POST(request: Request, { params }: Context) {
  const { id } = await params;
  if (!validId(id)) return Response.json({ error: "Cliente no encontrado." }, { status: 404 });
  if (!isSameOriginPhotoRequest(request)) return Response.json({ error: "Solicitud no permitida." }, { status: 403 });
  const access = await getTenantAccess("customers.write");
  if (!access.ok) return Response.json({ error: "No tienes permiso para cambiar esta foto." }, { status: access.reason === "unauthenticated" ? 401 : 403 });
  const { data: customer, error: customerError } = await access.supabase.from("customers").select("id")
    .eq("tenant_id", access.membership.tenant_id).eq("id", id).maybeSingle();
  if (customerError) return Response.json({ error: "No se pudo consultar el cliente." }, { status: 503 });
  if (!customer) return Response.json({ error: "Cliente no encontrado." }, { status: 404 });
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_PHOTO_UPLOAD_BYTES + 65536) return Response.json({ error: "La foto no debe superar 8 MB." }, { status: 413 });
  let photo: Buffer;
  try {
    const form = await request.formData();
    const file = form.get("photo");
    if (!(file instanceof File) || file.size > MAX_PHOTO_UPLOAD_BYTES) throw new Error("INVALID_PHOTO");
    photo = await prepareCustomerPhoto(Buffer.from(await file.arrayBuffer()), file.type);
  } catch {
    return Response.json({ error: "Selecciona una imagen fija JPG, PNG o WebP válida de hasta 8 MB." }, { status: 400 });
  }
  const updatedAt = new Date().toISOString();
  const { error } = await access.supabase.from("customer_photos").upsert({
    customer_id: id, tenant_id: access.membership.tenant_id, image_data: `\\x${photo.toString("hex")}`,
    content_type: "image/webp", updated_by: access.userId, updated_at: updatedAt,
  }, { onConflict: "customer_id" });
  if (error) return Response.json({ error: "No se pudo guardar la foto. Inténtalo de nuevo." }, { status: 503 });
  revalidatePath(`/clientes/${id}`);
  revalidatePath("/clientes");
  revalidatePath("/cobros");
  return Response.json({ updatedAt }, { headers: privateHeaders });
}
