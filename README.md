# KrediMax

Plataforma para gestionar el financiamiento de dispositivos móviles, clientes, contratos y pagos.

## Cola manual de MDM

En `/mdm`, el rol **Programador MDM** puede consultar por sucursal los equipos por enrolar, bloquear o desbloquear y confirmar las acciones realizadas en la herramienta MDM. La opción **Probar con demos** abre tres casos ficticios.

## Adjuntos de solicitudes en Google Drive

En **Solicitudes → Nueva solicitud → Registrar cliente nuevo → Negocio propio**, adjunta un PDF, JPG, PNG o WebP por requisito. Si el estado financiero tiene varias páginas, guárdalas en un solo PDF. Los tres archivos juntos pueden pesar hasta 4 MB. El detalle de la solicitud permite descargarlos según los permisos de KrediMax.

1. En Google Cloud habilita la [API de Google Drive](https://console.cloud.google.com/apis/library/drive.googleapis.com), configura la pantalla de consentimiento y descarga el JSON de un [cliente OAuth de tipo Aplicación de escritorio](https://console.cloud.google.com/auth/clients). Guarda el JSON fuera del repositorio.
2. Con el ID de la empresa de KrediMax (`tenants.id`), ejecuta desde el proyecto:

   ```powershell
   node scripts/configure-application-drive.mjs "C:\ruta\credenciales-oauth.json" "ID-DE-LA-EMPRESA"
   ```

3. Abre el enlace que muestra la terminal y autoriza la cuenta dueña de los documentos. El comando crea o reutiliza la carpeta privada **KrediMax - Documentos de solicitudes** en **Mi unidad**, con el alcance `drive.file`, y escribe la configuración en `.env.local`. Reinicia KrediMax. Para el entorno alojado, configura las cinco variables `GOOGLE_DRIVE_APPLICATION_*` del servidor para la empresa correspondiente y vuelve a desplegar.

Los binarios se guardan en Drive y usan el espacio de la cuenta autorizada. Supabase guarda solo sus referencias. Mantén la carpeta privada. Para uso continuo, configura el consentimiento de Google para producción o uso interno. En modo de prueba externo el permiso caduca a los siete días. Si tienes que volver a autorizar, usa el mismo cliente OAuth y la misma cuenta para conservar el acceso a los documentos existentes.
