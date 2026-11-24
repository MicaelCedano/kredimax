import { z } from "zod";
import { downloadBusinessApplicationDocument } from "@/lib/financing/application-drive.server";
import { getTenantAccess } from "@/lib/security/tenant-access";
import { applicationDriveFileId } from "@/modules/financing/application-documents";
import { businessDocumentRequirements } from "@/modules/financing/application-income";

const privateHeaders = { "Cache-Control": "private, no-store" };

function documentError(error: string, status: number) {
  return Response.json({ error }, { status, headers: privateHeaders });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; field: string }> }) {
  const { id, field } = await params;
  const requirement = businessDocumentRequirements.find((document) => document.field === field);
  if (!requirement || !z.uuid().safeParse(id).success) return documentError("Documento no encontrado.", 404);

  const access = await getTenantAccess("financing.read");
  if (!access.ok) {
    if (access.reason === "unauthenticated") return documentError("Inicia sesión para descargar el documento.", 401);
    if (access.reason === "unavailable") return documentError("No se pudo consultar la solicitud.", 503);
    return documentError("No tienes permiso para descargar este documento.", 403);
  }

  const tenantId = access.membership.tenant_id;
  const { data: application, error } = await access.supabase.from("credit_applications")
    .select("quote_snapshot,submission_key,created_by").eq("tenant_id", tenantId).eq("id", id).maybeSingle();
  if (error) return documentError("No se pudo consultar la solicitud.", 503);
  if (!application?.submission_key || !application.created_by) return documentError("Documento no encontrado.", 404);

  const fileId = applicationDriveFileId(application.quote_snapshot, requirement.field);
  if (!fileId) return documentError("Documento no encontrado.", 404);

  try {
    const document = await downloadBusinessApplicationDocument(fileId, requirement.field, {
      tenantId, submissionKey: application.submission_key, actorId: application.created_by,
    });
    if (!document) return documentError("Documento no encontrado.", 404);
    const name = encodeURIComponent(`${requirement.label}.${document.extension}`);
    return new Response(document.body, {
      headers: {
        ...privateHeaders,
        "Content-Type": document.mimeType,
        "Content-Disposition": `attachment; filename="documento.${document.extension}"; filename*=UTF-8''${name}`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return documentError("No se pudo descargar el documento desde Google Drive.", 502);
  }
}
