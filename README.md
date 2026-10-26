# KrediMax

Base de una plataforma SaaS multitienda para financiar y administrar dispositivos móviles en República Dominicana. La interfaz usa datos ficticios claramente marcados hasta conectar servicios autorizados.

## Requisitos

- Node.js 22 o posterior.
- npm.
- Para autenticación y base de datos local: Ubuntu 24.04 en WSL.

## Desarrollo local

```powershell
npm install
npm run dev
```

Abre `http://localhost:3000`. Sin credenciales Supabase, el dashboard permanece en modo de demostración y el acceso real muestra que falta configuración. En esta máquina, tanto el servidor dev de Turbopack como el de Webpack informaron `Ready` pero no respondieron a HTTP; el build Webpack sí funciona y `npm run start` sirvió login con HTTP 200. `npm run dev:webpack` permite comparar el servidor dev con Webpack. Consulta la sección Comandos para la limitación comprobada.

## Supabase local en WSL

El entorno de esta PC usa Supabase CLI nativo dentro de Ubuntu 24.04 en WSL; no necesita Docker ni se enlaza a un proyecto remoto. Las variables locales viven en `.env.local` (ignorada por Git).

Inicia el stack local desde PowerShell:

```powershell
wsl.exe -d Ubuntu-24.04 -u root -- env SUPABASE_NATIVE_POSTGRES_USER=supabase-postgres /root/.supabase/bin/supabase --experimental --workdir /mnt/c/Users/xmica/OneDrive/Documentos/KrediMax stack start --runtime native --eager --exclude realtime,storage,functions,mail,analytics,pooler
```

Después de iniciar el stack, aplica las migraciones versionadas y los datos iniciales locales:

```powershell
npm run db:migrate
wsl.exe -d Ubuntu-24.04 -u root -- /root/.supabase/bin/supabase --experimental --workdir /mnt/c/Users/xmica/OneDrive/Documentos/KrediMax db query --local --file /mnt/c/Users/xmica/OneDrive/Documentos/KrediMax/scripts/seed-local-tenant.sql
```

La semilla solo permite las bases locales previstas y deja activa una sucursal: YacellTech La Romana. No uses `db push` ni `--linked` durante el desarrollo local. La migración a un entorno alojado se hará cuando el trabajo local esté terminado y revisado. Mantén `DATABASE_URL` solo en procesos de servidor y herramientas de migración; nunca uses una secret key o `service_role` en variables `NEXT_PUBLIC_*`.

Las migraciones versionadas están en `drizzle/`; `npm run db:migrate` carga la URL privada de `.env.local`, rechaza cualquier host que no sea localhost y las aplica en el orden del diario. Si detecta que el SQL fuente de una migración ya aplicada cambió, avisa y no lo vuelve a ejecutar. Antes de llevarlas a un entorno alojado, revisar duplicados normalizados, asignaciones de pagos y mapeos/alcances de sucursal.

MDM permanece desactivado hasta elegir un proveedor: `/mdm` muestra únicamente el historial en modo de lectura y las escrituras de comandos están revocadas en la base. No se envían acciones a dispositivos.

## Perfiles y vendedores

Cada persona entra con su correo y contraseña. Desde **Mi perfil** (menú lateral o avatar) puede actualizar su nombre y cambiar la contraseña confirmando la actual; después del cambio debe iniciar sesión de nuevo.

El administrador crea accesos en **Usuarios → Crear usuario** con nombre, correo, contraseña inicial de al menos 12 caracteres, rol y sucursal. El rol **Vendedor** registra clientes, equipos y solicitudes en su sucursal; la evaluación requiere un encargado o administrador. La creación queda auditada y no altera cuentas existentes. El servidor requiere `SUPABASE_SECRET_KEY` en `.env.local`, además de las migraciones 0059 y 0060; nunca expongas esa clave en variables `NEXT_PUBLIC_*`.

## Registro local de errores del servidor

Next.js captura errores no manejados de solicitudes mediante `src/instrumentation.ts` y los escribe como eventos JSON en la salida del proceso local. El registro contiene ruta de plantilla, método, tipo de operación, nombre de error permitido y solo un indicador de si Next.js suministró un digest; no guarda su valor. Omite mensaje, stack, URL con query, cabeceras y cuerpo de la solicitud. No transmite eventos a un servicio externo ni aporta alertas, métricas, retención o monitoreo de disponibilidad; eso requiere definir infraestructura y política.

## Respaldo local cifrado y restauración de verificación

El respaldo local manual incluye la base PostgreSQL completa (también los esquemas de Auth presentes en esa base) en un archivo cifrado AES-256-GCM. No incluye archivos binarios de Storage ni configuración/proveedores externos; el stack local actual excluye Storage. El archivo `.kmax.enc` no se incorpora a Git. La clave debe ser una variable efímera del operador, guardada aparte del respaldo y fuera del repositorio; el comando falla si no existe y nunca la genera ni la imprime.

En PowerShell, carga la clave de 32 bytes hexadecimales desde tu gestor seguro y ejecuta:

```powershell
$env:KREDIMAX_BACKUP_KEY = '<clave-hexadecimal-de-64-caracteres>'
npm run db:backup:local -- ./.backups/kredimax-local.kmax.enc
npm run db:restore:local -- ./.backups/kredimax-local.kmax.enc kredimax_restore_prueba
npm run db:drop-restore:local -- kredimax_restore_prueba
Remove-Item Env:KREDIMAX_BACKUP_KEY
```

La restauración verifica autenticidad antes de crear una base nueva con prefijo `kredimax_restore_`; nunca sobrescribe `postgres`. Después de `pg_restore`, comprueba la presencia de las tablas principales, Auth, el historial de migraciones y conteos legibles. La base restaurada sirve para recuperación/inspección local y no queda conectada al servidor Supabase de la aplicación automáticamente. No existe todavía un backup programado ni retención definida para producción. Conserva la clave por separado; sin ella no se puede restaurar el archivo.

## Comandos

### Demostración local persistente

`npm run demo:local` agrega diez clientes ficticios marcados **DEMO** a YacellTech, usando la cuenta administradora y su sucursal configuradas en el entorno local. Conserva los registros existentes. Si la demostración ya existe, verifica sus datos y conserva el progreso; no reinicia saldos ni duplica expedientes. `npm run demo:verify` comprueba los conteos y la conciliación de sus pagos sin modificar datos. Ambos comandos rechazan bases fuera de localhost.

Los ejemplos incluyen una solicitud pendiente, documentación solicitada, rechazo, aprobación pendiente de activación, créditos activos, abono parcial, cuotas vencidas, adelanto, liquidación y pago revertido. Sus equipos, contratos, cronogramas, recibos y movimientos pueden consultarse en los módulos habituales; las operaciones de evaluación, activación y pago usan las RPC de la aplicación. El caso vencido es un expediente histórico ficticio insertado como parte de esta demostración, sin reescribir datos existentes. Las referencias de contrato `DEMO/` simulan expedientes; no son documentos reales ni archivos subidos a Storage.

La carga deja 10 clientes, 10 solicitudes, 10 equipos, 7 financiamientos, 70 cuotas y 10 pagos, uno revertido. Todos permanecen disponibles para operar desde la interfaz. Sus identificadores quedan en `.local-demo/manifest.json`, excluido de Git; borrar ese archivo no borra los registros de la base. MDM continúa desactivado y no se generan comandos de demostración.

```powershell
npm run dev
npm test
npm run lint
npm run typecheck
npm run build
npm run verify:code
```

`npm run verify:code` ejecuta tests unitarios, ESLint, TypeScript, build de producción con Webpack y comprueba que el manifest contenga el proxy de autenticación con el matcher esperado. `npm run build` usa Webpack porque Next 16.4.2/Turbopack salió con código 0 inesperadamente al iniciar su proceso PostCSS para `src/app/globals.css`. Además, en esta máquina, `next dev` con Turbopack y `npm run dev:webpack` con Webpack informaron `Ready` pero no respondieron a HTTP, incluso con acceso local autorizado y después de limpiar la caché `.next/dev`. Un repro temporal de Next sin Proxy, Supabase ni base presentó el mismo fallo en `next dev --webpack`; esto apunta al runtime de desarrollo/entorno, no al código de KrediMax. El build con Webpack compila las 15 rutas y el Proxy, y `npm run start` sirve el login con HTTP 200. Para reproducir el diagnóstico usa `npm run dev` o `npm run dev:webpack`; para revisar la salida del build ejecuta `npm run build` y conserva el log si reaparece el fallo de PostCSS.

`npm run verify:local` requiere una base local ya inicializada: ejecuta el preflight de compatibilidad antes de migraciones pendientes, aplica esas migraciones con protección de host local, repite el preflight y corre las suites de integridad/RLS/concurrencia con fixtures ficticios y rollback/limpieza. Puede cambiar el esquema de Supabase local; nunca apunta a una base alojada. Para el primer despliegue de esquema vacío, usa `npm run db:migrate` después de iniciar Supabase local y ejecuta luego `npm run verify:local`.

El servidor de desarrollo permite además el origen de loopback `127.0.0.1` para HMR cuando se abre la aplicación con esa dirección; esto no amplía el acceso del build de producción.

Para crear una migración, ejecuta `npm run db:generate -- --name=descripcion` y revisa cada SQL antes de aplicarlo. `supabase/tests/rls_tenant_isolation.sql` requiere Supabase local y revierte sus datos de prueba dentro de una transacción.

`npm run db:test:local` ejecuta pruebas financieras y de aislamiento con transacciones revertidas, más pruebas concurrentes con un tenant ficticio que se elimina y cuya limpieza se verifica al terminar. El script rechaza cualquier `DATABASE_URL` fuera de `localhost` y `127.0.0.1`.

Los avisos pertenecen al usuario autenticado: el rol API solo puede leer los propios y actualizar `read_at`; creación y cambios de contenido quedan reservados a flujos confiables. La matriz de `role_financial_permissions.sql` comprueba esta frontera con usuarios de prueba y rollback.

Antes de una migración nueva que añada restricciones, ejecuta `npm run db:preflight:local`. Es una inspección de solo lectura, muestra conteos sin datos personales y termina con código 2 si encuentra identidades duplicadas, asignaciones incoherentes, ambigüedad de sucursal u otro conflicto. Solo acepta Supabase local; no acredita compatibilidad de una base alojada, que requiere el mismo análisis en preproducción.

La prueba `financial_defaults_hardening.sql` comprueba la cotización de 5 meses con los valores de respaldo de la RPC cuando el tenant no tiene una fila de configuración, además de rechazar `NaN` y snapshots incompletos o mal tipados.

Para repetir el flujo UI de cobro y reverso (solo base local), ejecuta `node scripts/local-ui-payment-fixture.mjs prepare`, inicia la aplicación e inicia sesión, registra RD$5 en el préstamo `KrediMax E2E …` con la referencia que muestra el comando, comprueba el estado `registrado`, revierte ese pago desde la misma pantalla y verifica `revertido`. Ejecuta `node scripts/local-ui-payment-fixture.mjs verify-paid` después del cobro y `verify-reversed` después del reverso; al terminar, ejecuta siempre `node scripts/local-ui-payment-fixture.mjs cleanup`. La limpieza verifica y borra únicamente los IDs aleatorios de esa fixture.

Para comprobar las alertas de vencimiento en la interfaz local, ejecuta `node scripts/local-ui-due-alert-fixture.mjs prepare`, recarga `/notificaciones` con una sesión que tenga `payments.read`, confirma la cuota ficticia a dos días y ejecuta `node scripts/local-ui-due-alert-fixture.mjs verify`. Al terminar ejecuta siempre `node scripts/local-ui-due-alert-fixture.mjs cleanup`; solo elimina IDs aleatorios de la fixture y verifica su ausencia.

## Estado funcional

- Dashboard responsive con agregados completos calculados en PostgreSQL bajo RLS para el alcance de empresa/sucursal actual; los importes monetarios viajan como texto decimal para evitar pérdida de centavos al convertir JSON. Usa datos de ejemplo claramente etiquetados si la base no está disponible. Próximos vencimientos, actividad y serie de doce meses salen de la misma consulta agregada.
- Notificaciones presenta cuotas abiertas con vencimiento hoy o dentro de siete días de negocio en `America/Santo_Domingo`, sujetas al permiso `payments.read` y al RLS de empresa/sucursal. Son alertas en vivo dentro de la aplicación; no envía correo ni push.
- Reportes permiten filtrar por fechas de negocio, descargar agregados CSV y exportar el detalle de cobros con método, referencia, distribución y reverso. La exportación financiera exige `reports.read` y `payments.read`, conserva importes decimales exactos y aplica RLS por empresa/sucursal.
- Estado de cuenta por préstamo con datos del contrato, desglose financiero disponible y conciliado por cuota, cronograma/saldos exactos, pagos netos y reversos compensatorios; las cuotas y el historial se paginan completos. Cada cobro conserva un recibo imprimible con método, referencia y distribución original.
- En Cobros, el valor inicial del formulario es el saldo de la cuota visible, pero el máximo permitido es el saldo completo del préstamo; el RPC distribuye cualquier pago válido desde las cuotas más antiguas.
- Formulario de acceso Supabase Auth preparado; requiere configurar URL/key y usuarios.
- Los formularios mantienen en memoria los campos no secretos después de errores de validación/servicio; el acceso y recuperación solo conservan el correo, nunca contraseñas, y no pasan datos personales por la URL.
- MFA TOTP está temporalmente deshabilitado por decisión del usuario: no bloquea el acceso de Administradores y Supabase local no permite enrolar/verificar factores. La migración conserva roles, membresías, estado de empresa y permisos; no elimina factores ya enrolados. Esta configuración local no cambia los ajustes de Auth de un proyecto alojado.
- Clientes: lista con búsqueda, alta y edición de expediente; cada acción verifica sesión, membresía, permiso y RLS.
- Dispositivos: inventario con búsqueda, alta y edición; valida el dígito de control del IMEI y no ejecuta comandos MDM.
- No hay borrado de clientes ni dispositivos en esta etapa para conservar referencias históricas. La carga de documentos de clientes espera Storage privado y consentimiento.
- Modelo Drizzle y migración SQL inicial con tenant scoping, roles, permisos, datos financieros `NUMERIC`, idempotencia y RLS.
- Solicitudes y evaluación permiten separar aprobación de activación. La activación exige registrar el inicial cotizado, una referencia del contrato y confirmación expresa del operador de que verificó el documento firmado, y la entrega con fecha/responsable, en una RPC atómica. El sistema registra actor/hora de esa declaración; la referencia no demuestra que exista el archivo. No cargues contratos ni otros documentos reales hasta configurar Storage privado y aprobar consentimiento/retención. Los préstamos históricos no se activan automáticamente.
- La administración de membresías está disponible para el administrador del tenant; no incluye invitación por correo. La selección de tenant no sustituye las políticas RLS.
- La base revoca DELETE/TRUNCATE de roles de API; cambios de membresía, sucursal, solicitud y contrato pasan por RPC con autorización/auditoría. Las escrituras de metadatos documentales permanecen deshabilitadas hasta definir consentimiento y almacenamiento privado.
- La gestión de sucursales permite consultar y crear mediante RPC auditada al rol Administrador, aunque tenga sucursal de contexto. Una membresía sin sucursal solo se permite para Administrador; otros roles asignados quedan limitados a esa sucursal y no pueden crear sucursales ni escribir directamente en la tabla.
- Administrador puede consultar y operar en toda la empresa aunque tenga una sucursal asignada; esa sucursal funciona como contexto predeterminado. Los demás roles quedan limitados a su sucursal en lectura y escritura. La migración local hizo backfill solo donde las relaciones históricas eran inequívocas.
- Recuperación de contraseña depende de configurar Supabase Auth y un proveedor de correo. Storage privado y MDM real requieren servicios externos; MDM permanece desactivado por decisión del usuario. El cierre de caja está fuera del alcance. Reportes incluye conciliación interna de pagos, distribuciones y asientos bajo RLS; no concilia extractos bancarios.
- Los cobros parciales, pago final, reintentos idempotentes, sobrepago concurrente, reversos compensatorios y aislamiento por sucursal tienen pruebas SQL locales; la prueba concurrente limpia y verifica sus fixtures ficticias. Esta base local no equivale a una aprobación para producción: falta migrar y validar el entorno alojado, configurar dependencias externas y completar la matriz de carreras para otras RPC.

Consulta [ARCHITECTURE.md](./ARCHITECTURE.md) para límites, decisiones y pendientes.
