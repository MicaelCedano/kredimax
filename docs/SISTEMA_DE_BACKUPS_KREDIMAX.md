# Sistema de Copias de Seguridad y Recuperación ante Desastres (DRP) — KrediMax

Este documento detalla la arquitectura, configuración, automatización, seguridad y procedimientos de recuperación para el sistema de backups de KrediMax.

---

## 1. Arquitectura y Especificaciones Técnicas

| Componente | Detalle de Implementación |
| :--- | :--- |
| **Frecuencia y Hora** | Diario a las 3:00 a. m. hora dominicana (`America/Santo_Domingo` · UTC-4 / 07:00 UTC). |
| **Base de Datos** | PostgreSQL 17 (Supabase). Dump estructurado con esquemas, tablas, relaciones, secuencias y datos. |
| **Documentos y Archivos** | Extracción paquetizada y comprimida (gzip) de fotos de clientes (`customer_photos`), comprobantes de cobro (`payment_evidence`), documentos (`customer_documents`) y buckets de Supabase Storage. |
| **Cifrado en Reposo y Tránsito** | Autenticado **AES-256-GCM** con cabecera mágica `KMAXBKP1`, vector de inicialización (IV) de 12 bytes y etiqueta de autenticación (Auth Tag) de 16 bytes. |
| **Integridad** | Checksum **SHA-256** del archivo original y del archivo cifrado; verificación de etiqueta GCM. |
| **Replicación Externa** | Google Drive API v3 (con reintentos y retroceso exponencial). |
| **Estructura en Drive** | `KrediMax / Backups` → `Database / Daily`, `Database / Monthly`, `Documents / Daily`, `Logs`. |
| **Política de Retención** | 30 backups diarios y 12 backups mensuales. Filtrado exclusivo de archivos de KrediMax. |
| **Protección Concurrente** | Bloqueo consultivo de PostgreSQL (`pg_try_advisory_lock`) para impedir ejecuciones simultáneas. |
| **Auditoría y Notificaciones** | Registro en `audit_logs` y generación de alertas automáticas en `notifications` para los administradores. |

---

## 2. Variables de Entorno Requeridas

Añade las siguientes variables a tu archivo `.env.local` y a los **Secrets** de tu repositorio en GitHub:

```bash
# ==============================================================================
# BASE DE DATOS Y AUTENTICACIÓN
# ==============================================================================
DATABASE_URL="postgresql://postgres.xxx:yyy@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require"
NEXT_PUBLIC_SUPABASE_URL="https://xxx.supabase.co"
SUPABASE_SECRET_KEY="eyJhbGciOiJIUz..."

# ==============================================================================
# CIFRADO DE BACKUPS (AES-256-GCM)
# ==============================================================================
# Clave hexadecimal estricta de 64 caracteres (32 bytes). NUNCA guardarla en Google Drive ni en el bundle del cliente.
KREDIMAX_BACKUP_KEY="10b5422e13431d9262cfe49109aecc78c83e0bf4faa86814b8da1077498f3832"

# Token secreto para disparar el backup vía webhook/API (/api/backups/trigger)
KREDIMAX_BACKUP_CRON_SECRET="kredimax_cron_secret_secure_token_abc123"

# ==============================================================================
# GOOGLE DRIVE API (Opción recomendada: Cuenta de Servicio)
# ==============================================================================
GOOGLE_SERVICE_ACCOUNT_EMAIL="kredimax-backup-bot@tu-proyecto.iam.gserviceaccount.com"
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n"

# Opcional: ID de carpeta raíz en Google Drive si deseas fijar una carpeta específica
GOOGLE_DRIVE_BACKUP_FOLDER_ID=""
```

---

## 3. Instrucciones para Conectar Google Drive

### Método Recomendado: Cuenta de Servicio de Google Cloud (Sin intervención de usuario)

1. **Crear o seleccionar proyecto en Google Cloud Console:**
   - Ingresa a [Google Cloud Console](https://console.cloud.google.com/).
   - Crea un nuevo proyecto llamado `KrediMax Backups` (o usa uno existente).

2. **Habilitar Google Drive API:**
   - En el menú lateral, ve a **APIs y servicios** → **Biblioteca**.
   - Busca `Google Drive API` y haz clic en **Habilitar**.

3. **Crear la Cuenta de Servicio:**
   - Ve a **APIs y servicios** → **Credenciales**.
   - Haz clic en **Crear credenciales** → **Cuenta de servicio**.
   - Asigna un nombre, por ejemplo: `kredimax-backup-bot`.
   - Haz clic en **Crear y continuar** y luego en **Listo**.

4. **Generar la Clave Privada (JSON):**
   - En la lista de cuentas de servicio, haz clic sobre la cuenta recién creada.
   - Ve a la pestaña **Claves** → **Agregar clave** → **Crear clave nueva**.
   - Selecciona el formato **JSON** y descárgalo.
   - Copia el campo `client_email` en la variable `GOOGLE_SERVICE_ACCOUNT_EMAIL`.
   - Copia el campo `private_key` en la variable `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`.

5. **Compartir la carpeta en tu Google Drive:**
   - Abre tu Google Drive personal o empresarial.
   - Crea una carpeta llamada `KrediMax` (o `KrediMax Backups`).
   - Haz clic derecho en la carpeta → **Compartir**.
   - Pega el correo de la cuenta de servicio (`kredimax-backup-bot@...`) y dale permisos de **Editor**.
   - *(Opcional)*: Copia el ID de la carpeta de la URL de Drive y colócalo en `GOOGLE_DRIVE_BACKUP_FOLDER_ID`.

---

## 4. Automatización con GitHub Actions

El repositorio cuenta con el flujo de trabajo automatizado en `.github/workflows/daily-backup.yml`.

- **Horario:** Ejecución diaria a las `07:00 UTC` (3:00 a. m. hora dominicana).
- **Activación manual:** Disponible desde la pestaña **Actions** en GitHub → *KrediMax Automated Daily Backup* → **Run workflow** (permite elegir entre `daily`, `monthly` o `manual`).
- **Seguridad:** Utiliza GitHub Encrypted Secrets para todas las variables confidenciales sin exponerlas al código ni al navegador.

### Configuración de Secretos en GitHub:
En tu repositorio de GitHub, dirígete a:
**Settings** → **Secrets and variables** → **Actions** → **New repository secret** y añade:
1. `DATABASE_URL`
2. `KREDIMAX_BACKUP_KEY`
3. `GOOGLE_SERVICE_ACCOUNT_EMAIL`
4. `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
5. `NEXT_PUBLIC_SUPABASE_URL`
6. `SUPABASE_SECRET_KEY`

---

## 5. Panel Administrativo en KrediMax

Ubicación en la interfaz:
**Administración → Configuración → Copias de seguridad** (`/configuracion/backups`)

Funcionalidades del panel:
1. **Tarjetas KPI en tiempo real:**
   - Estado del sistema y confirmación de cifrado AES-256-GCM.
   - Fecha, hora exacta y tamaño del último backup exitoso.
   - Cuenta regresiva del próximo backup programado (3:00 AM AST).
   - Estado de la conexión con Google Drive y ruta de destino.
2. **Botón "Crear backup ahora":** Dispara una copia manual inmediata con bloqueo de concurrencia y auditoría.
3. **Botón "Ver historial":** Muestra la bitácora histórica completa con fecha, tipo, archivo, tamaño, checksum SHA-256, estado y verificación.
4. **Botón "Descargar backup cifrado":** Permite descargar directamente el archivo `.kmax.enc` validando permisos de administrador.
5. **Botón "Verificar integridad":** Comprueba que la firma criptográfica AES-256-GCM y el SHA-256 del archivo coincidan al 100%.
6. **Botón "Consultar opciones de restauración":** Despliega el protocolo de contingencia y comandos CLI de recuperación segura.

---

## 6. Procedimiento de Recuperación y Restauración

> [!CAUTION]
> **Prohibición de Restauraciones Destructivas Web:** KrediMax no admite la restauración con un solo clic sobre la base de producción desde la interfaz web, para evitar incidentes catastróficos o accesos maliciosos. Toda restauración debe ser validada previamente en una base temporal aislada.

### Paso 1: Validar la integridad del archivo cifrado (Dry-Run)
Verifica que el archivo no haya sido alterado y que la clave de descifrado sea la correcta:

```bash
node scripts/restore-backup.mjs verify "kredimax_db_20261031_030000.dump.kmax.enc"
```

### Paso 2: Descifrar el volcado a un archivo local seguro
```bash
node scripts/restore-backup.mjs decrypt "kredimax_db_20261031_030000.dump.kmax.enc" "restauracion_verificacion.dump"
```

### Paso 3: Restaurar en una base de datos temporal
Crea una base de datos de prueba (por ejemplo `kredimax_restore_test_20261031`) y restaura los datos:

```bash
node scripts/restore-backup.mjs restore "kredimax_db_20261031_030000.dump.kmax.enc" "postgresql://.../kredimax_restore_test_20261031"
```
El script validará automáticamente que:
- La tabla `tenants` exista y contenga los registros de la empresa.
- Las tablas críticas `customers`, `loans`, `payments`, `installments` estén presentes.
- El historial de migraciones (`drizzle.__drizzle_migrations`) esté intacto (>= 80 migraciones aplicadas).

### Paso 4: Restauración a Producción con Autorización Explícita
Una vez validada la base temporal y autorizada por la dirección técnica, aplica la copia en producción con el flag de confirmación obligatorio:

```bash
node scripts/restore-backup.mjs restore "kredimax_db_20261031_030000.dump.kmax.enc" "$DATABASE_URL" --confirm-destructive-production-overwrite
```

---

## 7. Comandos de Consola Disponibles

```bash
# Ejecutar copia de seguridad diaria programada o manual
npm run db:backup:automated -- --type=daily
npm run db:backup:automated -- --type=manual

# Herramienta de recuperación y restauración
npm run db:backup:restore -- verify "archivo.dump.kmax.enc"
npm run db:backup:restore -- decrypt "archivo.dump.kmax.enc" "archivo.dump"
npm run db:backup:restore -- restore "archivo.dump.kmax.enc" "postgresql://..."

# Validación de código y pruebas
npm run test
npm run verify:code
```
