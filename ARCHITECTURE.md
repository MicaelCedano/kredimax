# Arquitectura de KrediMax — Fase 1

## Decisiones

- Next.js App Router con TypeScript strict, Server Components por defecto y cliente solo para interacción local/gráficas.
- Tailwind CSS v4 para el sistema visual; Lucide React para iconos; Recharts solo para la gráfica del dashboard.
- Supabase Auth SSR con cookie adapters y `getClaims()` en `proxy.ts` para validar sesión y refrescar cookies. `@supabase/ssr` usa claves publicables; nunca se expone una clave privilegiada en `NEXT_PUBLIC_*`.
- PostgreSQL/Supabase como fuente de verdad; Drizzle modela el esquema y SQL versionado define RLS y restricciones. El cliente de DB de servidor no se usa para saltar RLS en solicitudes de usuario.
- Cada registro empresarial lleva `tenant_id`; claves foráneas compuestas conservan el tenant entre relaciones.
- Dinero con `NUMERIC(14,2)` en PostgreSQL. Registro de pagos usa clave de idempotencia. El mayor no admite actualización ni borrado desde grants de usuario; reversiones son asientos compensatorios.
- Zona horaria predeterminada `America/Santo_Domingo`, moneda `DOP`.

## Seguridad inicial

- Las políticas requieren membresía autenticada y activa para el tenant; las escrituras consultan `role_permissions` mediante `app_private.has_tenant_permission`. La función encapsula la lectura de permisos para evitar recursión RLS y rechaza miembros inactivos.
- `tenant_admin` puede leer y operar en todas las sucursales aunque tenga una sucursal de contexto. Para otros roles, RLS, RPC y acciones de servidor mantienen el alcance de lectura y escritura en su sucursal. Una membresía con `branch_id NULL` solo se permite para `tenant_admin`. Los RPC de identidad, solicitud, equipo y financiación verifican el mismo alcance.
- Las claves foráneas compuestas atan los UUID relacionados al mismo `tenant_id` y rechazan referencias cruzadas entre empresas.
- Los usuarios pueden leer su propia membresía; `tenant_admin` puede consultar y gestionar membresías de todas las sucursales mediante RPC autorizada, serializada y auditada. También puede administrar sucursales. No se confía en `user_metadata` para roles.
- Archivos de clientes guardan solo `storage_path` en el esquema; bucket privado, URL firmada y retención requieren configuración de Storage y consentimiento implementados antes de subir documentos reales.
- MDM está desactivado hasta elegir un proveedor. El historial se consulta en solo lectura; el servidor rechaza comandos y PostgreSQL revoca INSERT/UPDATE/DELETE para roles API.
- Registro, distribución FIFO y asiento del pago se ejecutan en una RPC transaccional con idempotencia, bloqueo de préstamo, validación del saldo y auditoría. Los reversos autorizados agregan un asiento compensatorio; los saldos originales no se borran.
- La activación registra en una sola transacción el pago del inicial cotizado, la referencia documental de contrato firmado, la declaración expresa del operador que verificó el documento (actor y hora), la entrega y su responsable autenticado. Mientras Storage privado y su política de consentimiento/retención no estén configurados, la ruta se conserva como referencia y no se verifica la existencia del archivo; no deben cargarse documentos reales.
- Las RPC de solicitudes y contratos fijan su timezone de función a `America/Santo_Domingo` para validar la fecha de la primera cuota y generar el año contractual, aunque el cliente o el servidor conecten con otra zona.

## Modelo incluido

`tenants`, `branches`, `tenant_memberships`, `roles`, `permissions`, `role_permissions`, `customers`, `customer_documents`, `devices`, `mdm_providers`, `mdm_commands`, `credit_applications`, `credit_contracts`, `loans`, `installments`, `payments`, `payment_allocations`, `ledger_accounts`, `ledger_entries`, `notifications`, `audit_logs` y `tenant_settings`.

## Pendientes antes de usar datos reales

1. **Verificación local ejecutada:** `npm run verify:local` cubre seis suites SQL transaccionales y tres pruebas concurrentes con roles, aislamiento de tenant/sucursal, cobros, activación, reversos y guardia de último Administrador. Además, un flujo E2E local con identidad ficticia de cajero comprobó la interfaz de cobros, RPC autorizada, distribución, asiento, auditoría, lectura del recibo y denegaciones por rol. Antes de producción todavía se requiere una matriz autenticada completa en una base de preproducción independiente, con la política de autenticación vigente (TOTP actualmente deshabilitado) y usuarios de distintas sucursales.
2. Configurar un proveedor de correo para recuperación de acceso. MFA TOTP está temporalmente deshabilitado por decisión del usuario; reactivarlo requiere una decisión posterior y aplicar la política también en Auth alojado. No enviar correos durante la validación local.
3. El usuario dejó pendientes el texto de consentimiento y el plazo de retención. Definirlos antes de habilitar bucket privado, reglas Storage, URLs firmadas o cargas de cédulas/contratos; hoy las rutas documentales no demuestran que exista un archivo firmado.
4. Elegir infraestructura y política para límites de tasa, métricas/alertas, copias/restauración y privacidad aplicable en RD. El servidor ya escribe errores no manejados en logs JSON locales sin datos de solicitud; no hay proveedor externo de observabilidad, alertas ni retención de backups definida.
5. Revisar contratos, mora y cobranza con asesoría aplicable. No hay proveedor MDM configurado; el módulo y la cola de comandos permanecen desactivados hasta que se defina uno.
6. Aplicar y validar las migraciones en un entorno alojado autorizado luego de revisar duplicados normalizados, mapeos de sucursal y distribuciones existentes. No se ha conectado ni migrado una base remota. Ningún préstamo histórico se activa automáticamente.
7. El cierre de caja está excluido por decisión del usuario. Reportes ofrece una conciliación interna de pagos, asignaciones y asientos para el alcance visible por RLS; no confirma depósitos bancarios. No introducir cierres automáticos ni modificar operaciones históricas.
