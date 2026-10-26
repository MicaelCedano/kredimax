# KrediMax: auditoría y sistema visual

## Auditoría previa (24 de octubre de 2026)

- Next.js 16.4.2 App Router, React 19, TypeScript estricto, Tailwind 4, Lucide y Recharts. La configuración shadcn existe, pero los componentes instalados son propios; se reutilizan sin agregar una segunda biblioteca.
- Rutas: dashboard, clientes y expedientes, solicitudes y asistente, financiamientos y contratos, cobros y recibos, dispositivos, reportes, auditoría, sucursales, usuarios, perfil, notificaciones y configuración. Acceso y recuperación tienen pantallas independientes.
- `Sidebar`, `Topbar`, `MobileNavigation`, `EmptyState`, `StatusBadge`, `ActionDialog` y `PreservedActionForm` permiten extender el diseño sin sustituir flujos.
- Problemas: paleta clara fijada en muchas clases, sidebar visualmente pesado, radios y elevaciones dispares, formularios sin tratamiento global, pantallas sin skeleton, navegación móvil no modal y resumen financiero fijo únicamente desde 1280 px.
- El asistente ya valida por paso, conserva campos ante errores, busca identidades y calcula cotizaciones reales. Los formularios usan acciones de servidor y preservación de datos. Se conservan estas conexiones.
- Línea base: 29 archivos de pruebas y 110 pruebas aprobadas. El directorio no es un repositorio Git. Hay un servidor local existente en 3001.

## Dirección visual

Inspiración iOS y Wallet: interfaz sobria con azul KrediMax, superficies frías, navegación translúcida moderada y una tarjeta de saldo azul profundo. La información financiera tiene jerarquía y cifras tabulares. El vidrio se limita al chrome, evitando desenfocar tablas y formularios.

## Tokens y componentes

- Azul de marca `#1264dc`; azul de acción oscuro accesible en tema claro y azul luminoso en oscuro.
- Lienzo claro `#f3f5f9`, superficies blancas; lienzo oscuro `#0b111d`, superficies `#141e2e`.
- Tipografía de sistema: SF en Apple, Segoe UI en Windows. Sin fuentes remotas ni dependencias nuevas.
- Escala de espacio de 4 px; controles de al menos 44 px; campos móviles de 16 px para evitar zoom involuntario.
- Radios: campos y acciones 12 px, superficies 20 px, indicadores de estado en cápsula.
- Sombras tenues y bordes definidos; foco azul visible y estados semánticos de error, advertencia y éxito.
- Primitivas compartidas: panel, título, tabla, campo, acción primaria/secundaria, aviso, skeleton y selector de apariencia.
- Tema `claro`, `oscuro` o `sistema`, persistido localmente; inicialización antes del primer render y sincronización entre pestañas.
- Navegación de escritorio desde 1024 px; panel móvil modal con foco contenido y búsqueda accesible en todos los tamaños.
- Asistente: progreso accesible, paneles animados sin desmontar campos y resumen fijo desde escritorio.
- Animaciones de 160–220 ms; `prefers-reduced-motion` desactiva movimiento y skeleton animado.

## Límites de implementación

No se cambian APIs, esquema, RPC, cálculos, permisos, roles, contratos, historial ni integraciones. MDM sigue desactivado. Los recibos conservan una superficie de impresión blanca independientemente del tema.

## Validación prevista

Pruebas existentes, ESLint, TypeScript y build; revisión en navegador de escritorio, tableta y móvil, temas, navegación, búsquedas, campos inválidos, pasos y diálogos. Las comprobaciones locales no constituyen evidencia de despliegue en producción.

## Verificación realizada

- 112 pruebas en 30 suites; ESLint y TypeScript aprobados.
- Matriz de 60 vistas: 14 rutas en ambos temas a 1536 px y 8 rutas a 320, 390, 768 y 1024 px. Sin desbordamiento horizontal ni errores de JavaScript/consola en esta matriz.
- Tema persistente al recargar y abrir otra pestaña; seguimiento del sistema; movimiento reducido; menú modal con foco contenido, Escape y restitución del foco.
- Asistente: validación de campos vacíos e IMEI inválido, cuatro pasos, actualización real de la cotización y preservación de campos al volver. No se envió la solicitud del recorrido visual.
- Cobro ficticio local: interfaz → acción/RPC → distribución → asiento → auditoría → recibo → impresión clara → reverso → lectura del saldo restaurado. Se eliminaron los registros de la prueba, incluida la evaluación automática del cliente ficticio.
- Se actualizó la limpieza del fixture existente para contemplar esa evaluación. No se cambió lógica financiera de la aplicación.
- Comparación con la copia previa: ningún archivo existente de lógica `.ts`, API, proxy o esquema cambió; la migración visual afecta TSX y CSS. Sin dependencias nuevas.
- Browser plugin no disponible: se utilizó Playwright con el Chrome instalado, sin instalar navegadores.
- Los enlaces de descarga CSV son enlaces nativos: eliminan la precarga de archivos como si fueran páginas, conservando las mismas URLs y permisos.
- Compilación optimizada local y manifiesto del proxy aprobados. Smoke final: fichas de cliente/solicitud/financiamiento/dispositivo/recibo, los tres CSV y descarga real, búsqueda móvil y tema con almacenamiento bloqueado; cero errores o advertencias de consola. Buscador móvil comprobado a 44 px y texto de 16 px.
- Servidor final local en `http://127.0.0.1:3001`. Se cerró solo la sesión temporal de QA y se eliminaron sus credenciales y scripts. No se realizó despliegue remoto.

## Revisión de fidelidad visual

Referencia generada: `C:/Users/xmica/.codex/generated_images/01a16fb4-c269-7c01-b073-2c405f520ff3/exec-b9d49b60-de57-4a4a-94bd-3fc1a811ccfe.png`.

Se inspeccionaron directamente la referencia y las capturas de navegador: lienzo frío y superficies, tipografía de sistema, selección azul de navegación, tarjeta de saldo profunda, radios/espaciados y jerarquía de tablas. Se corrigieron el menú de escritorio, los campos con iconos, el foco modal y los indicadores compactos de 320 px.

Desviaciones intencionales: se mantienen la marca existente, los textos, las métricas y los filtros funcionales del producto. No se implementaron las tendencias ni segmentaciones de cartera inventadas por la imagen conceptual. Los registros existentes son datos de prueba y no se usan para definir reglas o decisiones de negocio.
