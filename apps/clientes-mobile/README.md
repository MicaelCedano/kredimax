# KrediMax Clientes — Aplicación Móvil Android / iOS (Expo + React Native)

Aplicación móvil financiera oficial para clientes de **KrediMax**, diseñada con estética bancaria premium (`#0B1730`, `#172B4D`, `#16A085`, `#F5F7FB`), moneda dominicana (`RD$`), zona horaria `America/Santo_Domingo` y arquitectura segura conectada al backend administrativo Next.js + Supabase.

---

## 1. Características implementadas (MVP)

1. **Pantalla 1 — Bienvenida y Acceso (`app/login.tsx`)**:
   - Inicio de sesión con número de cédula dominicana (`000-0000000-0`) y contraseña.
   - Mostrar/ocultar contraseña, validación con React Hook Form + Zod y estados de error claros.
   - Flujo obligatorio de cambio de contraseña temporal en el primer ingreso (prohibiendo usar los últimos 4 dígitos o secuencias de la cédula).
   - Recuperación de acceso protegida y vista previa de biometría bancaria (`Huella / Face ID`).
   - Botón directo para **Modo DEMO interactivo** sin necesidad de base de datos de producción.
2. **Pantalla 2 — Inicio (`app/(tabs)/index.tsx`)**:
   - Saludo personalizado según la hora de República Dominicana, nombre del cliente (`Juan Pérez`), tarjeta principal con saldo pendiente (`RD$18,000.00`), barra de progreso animada (`40%`), total financiado (`RD$30,000.00`), total abonado (`RD$12,000.00`), próxima cuota (`RD$2,500.00`), equipo financiado (`Samsung Galaxy A55`) y selector de múltiples financiamientos.
3. **Pantalla 3 — Mis Financiamientos (`app/(tabs)/financiamientos.tsx`)**:
   - Marca y modelo del equipo, ilustración verificada del dispositivo, precio de venta, inicial pagada, monto financiado, saldo pendiente, fecha del contrato, estado del préstamo y número de contrato.
4. **Pantalla 4 — Mis Cuotas (`app/(tabs)/cuotas.tsx`)**:
   - Cronograma oficial con número de cuota, fecha de vencimiento, importe, abonado, saldo de la cuota y estado visual (`Pagada`, `Parcial`, `Pendiente`, `Vencida`) con filtros rápidos.
5. **Pantalla 5 — Historial de Pagos (`app/(tabs)/pagos.tsx`)**:
   - Fecha, monto, referencia, financiamiento correspondiente, estado del pago y visor/descarga de comprobantes oficiales autorizados.
6. **Pantalla 6 — Perfil (`app/(tabs)/perfil.tsx`)**:
   - Nombre del cliente, cédula parcialmente oculta (`***-****890-1`), teléfono, correo electrónico, formulario de cambio de contraseña con validación contra dígitos de cédula, contacto de soporte y cierre de sesión seguro (`expo-secure-store`).

---

## 2. Desarrollo local y pruebas

```bash
cd apps/clientes-mobile
npm install
npm run typecheck
npm test
npx expo start
```

---

## 3. Compilación de APK con Expo EAS Build

El archivo `eas.json` incluye el perfil `preview` configurado específicamente para generar un archivo instalable `.apk` (`"buildType": "apk"`) y el perfil `production` para Google Play (`"buildType": "app-bundle"`).

### Requisitos de autenticación EAS (Nube):
1. Instalar EAS CLI: `npm install -g eas-cli`
2. Iniciar sesión en tu cuenta Expo: `eas login`
3. Vincular el proyecto: `eas project:init`
4. Ejecutar la compilación del APK de prueba:
   ```bash
   eas build --platform android --profile preview
   ```

### Compilación local directa con Android SDK / Gradle:
Si dispones del Android SDK y JDK 17 instalados localmente:
```bash
cd apps/clientes-mobile
npx expo prebuild --platform android
cd android
./gradlew assembleRelease
```
El archivo APK instalable se genera en:
`apps/clientes-mobile/android/app/build/outputs/apk/release/app-release.apk`
