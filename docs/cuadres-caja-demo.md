# Cuadres diarios y vendedores de demostración

El cuadre usa `0078_daily_cash_closings` y `0079_cash_movement_detail`. La migración `0086_cash_drawer_handoff` agrega apertura, entrega y recepción por vendedor, sucursal y fecha.

La migración posterior `0080_application_creator_scope` limita las solicitudes y sus eventos al usuario que las creó. Solo el administrador de empresa puede consultar todas, ver el vendedor en la lista y el detalle, y filtrar por vendedor. La restricción también aplica al acceso directo por URL y a las lecturas de la API. Los demás módulos mantienen sus permisos existentes.

## Acceso

Abrir `http://127.0.0.1:3000/cajas` o **Cuadre de cajas** en el menú.

Las cuentas locales son `vendedor1@demo.kredimax.test`, `vendedor2@demo.kredimax.test` y `vendedor3@demo.kredimax.test`. Su contraseña generada está en `.local-demo/sellers.json`, excluido de Git. Se mantienen como vendedores; no pueden aprobar solicitudes ni revertir pagos. Pueden entregar un préstamo previamente aprobado, cobrar y cerrar su propia caja. El administrador ve el consolidado; el gerente y el auditor quedan limitados a sus sucursales. El auditor consulta sin cerrar.

`npm run demo:sellers` crea o verifica las cuentas y seis financiamientos ficticios, sin duplicar ni restablecer el progreso. Cada vendedor comienza con dos iniciales y dos cuotas: efectivo y transferencia. No modifica contratos o clientes existentes. Si falta el archivo de credenciales pero las cuentas ya existen, se detiene sin cambiar sus contraseñas.

## Operación diaria

1. Pulsar **Abrir caja** al iniciar. Se guarda el usuario y la hora de la apertura, incluso en días sin cobros.
2. Registrar el inicial y su evidencia desde la solicitud aprobada o la cuota desde **Cobros → Registrar pago**. El cobro se atribuye a su receptor y al día en que se registró. El sistema abre el recibo numerado al guardar el pago.
3. En **Cuadre de cajas**, elegir fecha y vendedor. **Ver movimientos** muestra cada entrada o reverso con cliente, contrato y recibo.
4. Pulsar **Cerrar y entregar cuadre**. Contar iniciales y cuotas en sus secciones y guardar juntos. Las transferencias esperadas en cero se completan automáticamente. Una diferencia por método exige observación.
5. Desde otra cuenta autorizada, pulsar **Confirmar recepción** y declarar el efectivo y los demás importes verificados. El administrador puede confirmar para la empresa y el gerente para su sucursal. Si hay diferencias con lo declarado, explicar el motivo. La recepción queda registrada junto al cierre original.
6. Revisar la tarjeta del vendedor. El sistema muestra apertura, cierre y entrega, y recepción, con los responsables y las horas en República Dominicana. Un cierre anterior conserva su hora y puede entregarse expresamente. Las aperturas históricas sin registro se muestran como tales.

El operador verifica las transferencias. El cierre y entrega bloquea cobros y reversos para la caja de ese vendedor, sucursal y fecha. Un reverso de otro día se registra como movimiento negativo del día del reverso en la caja del receptor original.

## Validación

La prueba `npm run db:test:cash` cubre apertura sin movimientos, cierre atómico, recepción por otro usuario, discrepancias por método, aislamiento, auditoría y conservación de cierres anteriores. Se ejecuta solo en una base local y revierte los datos ficticios.

### Verificaciones anteriores al flujo de recepción

- `npm test`: 221 pruebas aprobadas y una prueba omitida existente, incluidas nueve verificaciones del resumen, los cierres parciales, los reversos y las diferencias por método.
- `npm run lint`, `npm run typecheck`, `npm run build`: aprobados.
- `npm run db:test:cash`: tipos de cobro, efectivo/transferencia, totales, aislamiento, permisos, numeración, cierres, idempotencia, diferencias por método y reversos históricos. Los datos temporales se revierten.
- `npm run db:test:applications`: aislamiento de solicitudes entre dos vendedores de la misma sucursal, otras sucursales, administrador, otros roles, historial de decisiones, conteos, nombres de creador inmutables y bloqueo de revisión por RPC sin acceso a la solicitud. Los datos temporales se revierten. En navegador se comprobó que el Vendedor 1 ve sus dos solicitudes, una URL del Vendedor 2 devuelve 404 y el administrador filtra correctamente por vendedor.
- `npm run db:test:concurrency`: pagos/reintentos, activaciones, reversos y carrera entre cobro y cierre. Los expedientes temporales se limpian.
- Matriz de roles financieros actualizada y ejecutada por separado, con rollback.
- `npm run db:preflight:local`: sin conflictos de compatibilidad.
- Navegador: escritorio 1440×1000 y móvil 390×844; filtro de vendedor, alcance del vendedor, rechazo de diferencias sin motivo, cierre guardado y persistencia al recargar, detalle → recibo y formato previo para firma. Recibo y formato revisados en A4, una página cada uno.
- Se dejó un cierre demo de iniciales en cero del 25 de octubre de 2026 para el Vendedor 1. Las cajas del 26 se conservaron abiertas para pruebas.

La suite general `npm run db:test:local` se detiene antes de su matriz de roles porque `financial_defaults_hardening.sql` contiene una cotización incompatible con la política actual de cuotas (`INVALID_BALANCED_PAYMENT_POLICY`). Esa cotización no se cambió en este trabajo. También persiste la advertencia previa de checksum en `0045_tenant_admin_financing_branch_scope`. No se aplicaron migraciones ni despliegues remotos.
