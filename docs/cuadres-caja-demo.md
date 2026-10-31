# Cuadres diarios y vendedores de demostración

Implementado y comprobado en la base local. Las migraciones nuevas son `0078_daily_cash_closings` y `0079_cash_movement_detail`.

La migración posterior `0080_application_creator_scope` limita las solicitudes y sus eventos al usuario que las creó. Solo el administrador de empresa puede consultar todas, ver el vendedor en la lista y el detalle, y filtrar por vendedor. La restricción también aplica al acceso directo por URL y a las lecturas de la API. Los demás módulos mantienen sus permisos existentes.

## Acceso

Abrir `http://127.0.0.1:3000/cajas` o **Cuadre de cajas** en el menú.

Las cuentas locales son `vendedor1@demo.kredimax.test`, `vendedor2@demo.kredimax.test` y `vendedor3@demo.kredimax.test`. Su contraseña generada está en `.local-demo/sellers.json`, excluido de Git. Se mantienen como vendedores; no pueden aprobar solicitudes ni revertir pagos. Pueden entregar un préstamo previamente aprobado, cobrar y cerrar su propia caja. El administrador ve el consolidado; el gerente y el auditor quedan limitados a sus sucursales. El auditor consulta sin cerrar.

`npm run demo:sellers` crea o verifica las cuentas y seis financiamientos ficticios, sin duplicar ni restablecer el progreso. Cada vendedor comienza con dos iniciales y dos cuotas: efectivo y transferencia. No modifica contratos o clientes existentes. Si falta el archivo de credenciales pero las cuentas ya existen, se detiene sin cambiar sus contraseñas.

## Operación diaria

1. Al recibir un inicial, registrar la entrega y su evidencia desde la solicitud aprobada. Se atribuye a quien recibe el dinero y al día real del cobro, aunque la fecha de entrega del equipo sea anterior.
2. Para las cuotas, usar **Cobros → Registrar pago**. Elegir método y monto. **Imprimir formato para firma** permite imprimir antes de adjuntar la foto firmada. El formato previo no registra dinero ni reserva un folio.
3. Al guardar el inicial o la cuota, el sistema abre el recibo numerado, listo para imprimir. La numeración de nuevos financiamientos es `FIN-año-correlativo`; la de recibos es `REC-año-correlativo`, por empresa y año. Los documentos anteriores conservan su identificación.
4. En **Cuadre de cajas**, elegir fecha y vendedor. **Ver movimientos y comprobantes** muestra cada entrada o reverso con cliente, contrato y recibo. Sus totales incluyen todas las páginas.
5. Cerrar **Iniciales** y **Cuotas recurrentes** por separado. Escribir efectivo entregado, transferencias verificadas y tarjeta/otros. Una diferencia por método exige observación, incluso si los faltantes y sobrantes se compensan entre sí.
6. El consolidado indica cierres pendientes y diferencias. Solo muestra todas las cajas cuadradas cuando todos los cierres visibles están guardados y cada método coincide. Se puede imprimir el cuadre y firmar entrega/recepción.

Las transferencias declaradas como verificadas las confirma el operador; no hay conexión bancaria automática. Un cierre es definitivo para vendedor, sucursal, fecha y tipo. No se permite agregar cobros ni reversos a esa combinación después del cierre. Un reverso de otro día se registra como movimiento negativo del día del reverso en la caja del receptor original; no cambia el total de un día anterior.

## Validación

La pantalla agrupa los dos cierres de cada vendedor en una sola caja. El resumen destaca el total cobrado, iniciales, cuotas, métodos de pago y avance de los cierres. **Cuadrar iniciales / Cuadrar cuotas** abre el conteo con comparación en vivo: los campos vacíos no son cero y una diferencia por método exige observación aunque el total neto coincida. **Ver cierre** permite revisar uno ya guardado. En móvil, sus comparaciones se presentan por método sin tablas horizontales. La pantalla conserva las mismas operaciones y permisos.

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
