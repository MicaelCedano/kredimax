# Reporte de auditoría — KrediMax

**Fecha:** 20 de octubre de 2026  
**Alcance:** revisión estática del código y las migraciones presentes en el directorio de trabajo. Se revisaron autenticación, autorización multiempresa, pagos, solicitudes de crédito, almacenamiento de documentos y pruebas de aislamiento.  
**Límite:** no se ejecutaron pruebas, no se conectó a una base local o remota y no se inspeccionó `.env.local`. El directorio no contiene `.git`, por lo que no fue posible asociar los hallazgos a un commit.

## Resumen

**Estado: no apto para registrar operaciones financieras reales hasta aplicar y validar la corrección de KM-01 en la base de datos.** El código ahora incluye una migración que elimina las inserciones directas en las tablas financieras y de auditoría. No se aplicó a una base local o remota durante esta sesión.

También falta confirmar si una sucursal constituye un límite de acceso. El esquema guarda la sucursal del usuario, pero las políticas observadas limitan datos por empresa completa. La documentación del proyecto ya reconoce pendientes de MFA, Storage privado y pruebas ampliadas de RLS.

## Hallazgos

### KM-01 — Inserciones directas pueden eludir el registro transaccional de pagos

**Severidad: Alta (P1)**  
**Confianza: Alta**

**Estado al 20-10-2026:** corregido y validado en Supabase local mediante las migraciones `0011`–`0014` y pruebas con transacciones revertidas. No está aplicado ni validado en un entorno alojado.

La migración concede `INSERT` a `authenticated` sobre `payments`, `payment_allocations` y `ledger_entries` (`drizzle/0001_security.sql:60-64`). Las políticas de RLS permiten esas inserciones a quien tenga `payments.record` (`drizzle/0001_security.sql:116-123`).

La aplicación ofrece el RPC `record_loan_payment`, que verifica el préstamo, el saldo y la idempotencia; asigna el cobro a cuotas; y crea el asiento y el evento de auditoría en una transacción (`drizzle/0007_atomic_payment_posting.sql:18-78`). Sin embargo, la política y los permisos de tabla también permiten enviar esas escrituras directamente por la API de Supabase, sin pasar por el RPC. Una inserción directa puede crear un pago sin distribuirlo a cuotas ni registrar auditoría. Las asignaciones directas tampoco comprueban que el pago y la cuota pertenezcan al mismo préstamo ni que el total asignado coincida con el pago.

**Corrección aplicada en el código:** la migración nueva revoca `INSERT` de `PUBLIC`, `anon` y `authenticated` en pagos, asignaciones y asientos, y elimina sus políticas de inserción. También bloquea la inserción directa de auditoría para evitar eventos falsificados. El RPC de pago sigue siendo el camino autorizado y transaccional.

**Verificación local:** las pruebas de DB confirman que los roles de usuario no pueden insertar directamente pagos, distribuciones, asientos ni eventos de auditoría; la RPC registra pagos con distribuciones, asiento y auditoría; un usuario autorizado puede reversar con asiento compensatorio. El resultado se limita a la base local. La base alojada no debe considerarse corregida hasta ejecutar y verificar las migraciones allí.

### KM-02 — No hay aislamiento visible entre sucursales de una misma empresa

**Severidad: Media (P2, según la regla de negocio)**  
**Confianza: Alta en el comportamiento observado; falta confirmar la intención**

**Estado:** pendiente de decisión comercial del dueño del producto sobre el alcance por sucursal. No se endureció acceso por suposición.

La membresía contiene `branch_id` y `getTenantAccess` lo devuelve (`src/db/schema.ts`, tabla `tenant_memberships`; `src/lib/security/tenant-access.ts:3-6, 15-26`). No obstante, las políticas principales consultan permisos usando únicamente `tenant_id`, sin comparar la sucursal del registro con `branch_id` (`drizzle/0001_security.sql:88-115`). Las consultas de las acciones también suelen filtrar por empresa completa; el formulario de financiamiento toma la sucursal de la membresía para la nueva solicitud, pero ese dato no limita la lectura de otras sucursales (`src/modules/financing/actions.ts`).

Por tanto, usuarios asignados a una sucursal pueden consultar registros de otras sucursales de la misma empresa si su rol tiene el permiso correspondiente. Si las sucursales son límites de confidencialidad o autoridad, esto es una brecha de autorización.

**Corrección recomendada:** definir explícitamente el alcance por rol. Si el límite es por sucursal, aplicar la verificación tanto en RLS como en las funciones de servidor y cubrir lectura y escritura cruzada. Si ciertos roles deben ver toda la empresa, documentarlo y distinguir ese alcance en permisos.

## Controles observados

- Las rutas de servidor consultan los claims de Auth y la membresía activa antes de realizar operaciones (`src/lib/security/tenant-access.ts:9-45`).
- Las relaciones principales incluyen claves foráneas compuestas con `tenant_id` para impedir referencias entre empresas (`drizzle/0002_tenant_integrity.sql`).
- El pago normal del servidor usa un RPC transaccional, una clave de idempotencia y control de saldo (`src/modules/payments/actions.ts:14-35`; `drizzle/0007_atomic_payment_posting.sql:18-78`). El hallazgo KM-01 muestra que ese RPC no es el único camino permitido.
- El proxy actualiza la sesión con `getClaims()` y redirige a inicio de sesión cuando Supabase está configurado (`proxy.ts:4-38`). El modo sin credenciales se describe en el README como demostración.
- El modelo contempla rutas privadas de documentos, consentimiento y retención, pero el propio documento de arquitectura indica que Storage privado y consentimiento aún deben implementarse antes de subir documentos reales (`ARCHITECTURE.md`, “Seguridad inicial” y “Pendientes antes de usar datos reales”). No se encontró un flujo de carga en el alcance revisado.

## Evidencia de verificación

- Revisión estática de `src/`, `drizzle/`, `supabase/`, `scripts/`, `tests/`, `README.md` y `ARCHITECTURE.md`.
- Hay pruebas unitarias para dinero y cálculo de financiamiento (`tests/money.test.ts`, `tests/financing-calculator.test.ts`). Existe un script SQL de aislamiento, pero solo cubre lectura, actualización e inserción de clientes entre dos empresas (`supabase/tests/rls_tenant_isolation.sql`). No se ejecutó en esta auditoría.
- La revisión de implementación posterior ejecutó 3 archivos de pruebas unitarias (10 pruebas), ESLint, TypeScript y los dos guiones SQL locales; ambos SQL informaron éxito y revirtieron su transacción. Los casos financieros incluyen pago parcial, pago final, sobrepago denegado, reintento idempotente, reverso compensatorio, integridad de asignación y denegación por rol.
- Se aplicaron localmente las migraciones Drizzle hasta `0020_quote_snapshot_hardening.sql`. No se aplicaron migraciones alojadas ni hubo despliegue.
- Se inspeccionaron el dashboard y la búsqueda global en el navegador local autenticado. La página de login a 390×844 no desborda horizontalmente. Turbopack sigue fallando al iniciar su proceso interno durante el procesamiento de CSS; `next build --webpack` completa compilación y generación de rutas. Esto valida el build alterno, pero no resuelve el bloqueo de Turbopack ni demuestra QA móvil del dashboard.
- No se verificaron pagos mediante flujo UI real, concurrencia con sesiones independientes, alcance de sucursal, correo de recuperación, carga/descarga de documentos, cierre de caja, integraciones externas ni comportamiento en el entorno alojado.

La lista de trabajo y estados de los demás temas solicitados está en [`docs/seguimiento-auditoria-2026-10-20.md`](docs/seguimiento-auditoria-2026-10-20.md). Esta auditoría fuente contiene solo KM-01 y KM-02; no define hallazgos enumerados H01–H21.

## Acciones antes de producción

1. Aplicar `0011_restrict_financial_table_writes.sql` en Supabase local y validar las inserciones directas y el RPC; después planificar su aplicación al entorno alojado.
2. Decidir y documentar el límite de acceso entre sucursales; cerrar KM-02 si se requiere aislamiento.
3. Completar MFA, Storage privado, consentimiento y retención conforme a `ARCHITECTURE.md`.
4. Ejecutar pruebas RLS en Supabase local con usuarios de varios roles, dos empresas y, si aplica, dos sucursales.
5. Antes de usar datos reales, revisar límites de tasa, observabilidad, copias y restauración, y las reglas aplicables a contratos y cobranza en República Dominicana.

## Addendum de implementación — 20-10-2026

El reporte anterior conserva su alcance y observaciones estáticas. Después de esa revisión, el usuario confirmó que cada sucursal debe quedar aislada y que la activación exige los tres elementos: inicial pagado, contrato firmado/documentado y entrega con fecha/responsable.

- KM-01 se comprobó localmente con pruebas transaccionales revertidas; KM-02 se implementó con aislamiento por sucursal en migraciones `0021`–`0025` y prueba de RLS/lookup con dos sucursales ficticias. La migración `0026` añade creación de sucursales auditada mediante RPC para membresía central y revoca la inserción directa.
- La formalización/activación quedó implementada como RPC atómica, separando pago inicial de cobros de cuotas. No se activaron ni recalcularon préstamos históricos.
- Los reportes ahora filtran por período y descargan agregados CSV calculados en PostgreSQL bajo RLS; los tests de datos ficticios validan sumas, saldo abierto, cuotas vencidas y exclusión de pagos revertidos.
- Migraciones locales aplicadas: `0021_imei_change_validation` a `0029_dashboard_aggregates`. La 0028 audita cambios operativos sin guardar los valores personales; la 0029 calcula métricas completas del dashboard bajo RLS, incluyendo tendencia, próximos vencimientos y actividad. No se aplicó ninguna migración alojada ni hubo despliegue. La única membresía local inspeccionada está ligada a una sucursal, por lo que no puede crear sucursales sin que un administrador autorizado configure una membresía central; no se amplió su acceso por suposición.
- Las pruebas más recientes de base local ejecutaron `financial_integrity.sql`, `rls_tenant_isolation.sql` y `branch_isolation.sql`, con rollback. El reporte completo del trabajo, los resultados de builds/QA pendientes y los bloqueos externos están en [`docs/seguimiento-auditoria-2026-10-20.md`](docs/seguimiento-auditoria-2026-10-20.md).
- H01–H21 no están definidos por el reporte fuente; este addendum no presume identificadores inexistentes.
