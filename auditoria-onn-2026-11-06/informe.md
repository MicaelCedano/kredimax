# Auditoría de solo lectura — onn Google TV

Fecha: 6 de noviembre de 2026. Conexión ADB: 10.0.0.24:5555.

## Resultado

- Equipo identificado: onn. 4K Streaming Box, producto onn_4k_gtv, dispositivo YOC.
- Android 14, API 34; parche de seguridad indicado: 2026-09-01.
- Inventario: 141 paquetes; 11 de terceros. La consulta de paquetes deshabilitados devolvió una lista vacía para el usuario predeterminado.
- Inicio predeterminado: com.google.android.apps.tv.launcherx/.home.HomeActivity.
- Almacenamiento /data: 4.7 GB, 3.3 GB usados, 1.3 GB disponibles (valores reportados por el equipo).
- RAM: aproximadamente 1.87 GiB total, 758 MiB disponibles al momento de la consulta.
- Se obtuvo una captura PNG de la pantalla actual.

## Revisión con CleanYourTV

El proyecto documenta un onn 4K Streaming Box 2023 identificado como YOC, pero la lista compartida corresponde a otra compilación; no debe aplicarse automáticamente a este equipo. Las funciones de los paquetes deben comprobarse y las preferencias del usuario deben consultarse antes de cualquier cambio. CleanYourTV advierte que setupwraith puede ser propietario de la red Wi-Fi guardada durante la configuración y que deshabilitarlo podría desconectar el equipo. También documenta que cambiar el launcher puede afectar botones del control.

Fuentes: https://github.com/Gathin23/cleanyourtv/blob/main/PROMPT.md y https://github.com/Gathin23/cleanyourtv/issues/843

## Archivos y alcance

Los archivos incluyen propiedades, listas de paquetes, ajustes globales/seguros/sistema, actividades HOME, almacenamiento, memoria, tamaño y densidad de pantalla, actividad actual y captura. resultado-consultas.json registra los resultados de las consultas. Son respaldos de inventario y configuración legible: no incluyen datos privados de aplicaciones, credenciales, APK ni una imagen completa del dispositivo, y no garantizan una restauración integral. Pueden contener datos personales o identificadores: trátalos como privados.

No se desactivaron paquetes, cambiaron ajustes o launcher, instalaron aplicaciones ni se reinició el dispositivo. La autorización ADB fue concedida por el usuario y la depuración sigue activa. Cualquier modificación futura requiere autorización previa.
