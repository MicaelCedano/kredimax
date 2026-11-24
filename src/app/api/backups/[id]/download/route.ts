import { NextRequest, NextResponse } from "next/server";
import { getTenantAccess } from "@/lib/security/tenant-access";
import { downloadFileFromDrive, getGoogleAccessToken, isGoogleDriveConfigured } from "@/lib/backups/google-drive";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const access = await getTenantAccess("settings.manage");
  if (!access.ok) {
    return NextResponse.json({ error: "Acceso denegado. Permisos de administrador requeridos." }, { status: 403 });
  }

  const { data: backup, error } = await access.supabase
    .from("system_backups")
    .select("id, file_name, file_size_bytes, drive_file_id, status")
    .eq("id", id)
    .single();

  if (error || !backup) {
    return NextResponse.json({ error: "Archivo de respaldo no encontrado." }, { status: 404 });
  }

  if (backup.status !== "completed") {
    return NextResponse.json({ error: "El respaldo no está completado." }, { status: 400 });
  }

  if (!backup.drive_file_id) {
    return NextResponse.json(
      { error: "El archivo no está disponible en Google Drive. Descarga remota no disponible." },
      { status: 404 }
    );
  }

  if (!isGoogleDriveConfigured()) {
    return NextResponse.json(
      { error: "Google Drive no está configurado en las variables de entorno del servidor." },
      { status: 500 }
    );
  }

  try {
    const accessToken = await getGoogleAccessToken();
    const fileBuffer = await downloadFileFromDrive(accessToken, backup.drive_file_id);

    return new NextResponse(new Uint8Array(fileBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${backup.file_name}"`,
        "Content-Length": String(fileBuffer.length),
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
      },
    });
  } catch (err) {
    console.error("Error streaming backup download:", err);
    return NextResponse.json({ error: "Error descargando el archivo cifrado desde Google Drive." }, { status: 502 });
  }
}
