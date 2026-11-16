# HF Coach — proyecto Android

Repositorio privado del proyecto HF Coach. La primera entrega reutiliza la aplicación de videoanálisis existente y la empaqueta para Android mediante Capacitor.

## Compilación del APK

El código fuente de esta entrega está guardado en segmentos Base64 dentro de `.source/`. El workflow `Build HF Coach APK` los recompone, verifica el SHA-256 del ZIP original, extrae el proyecto, instala dependencias, genera el proyecto Android y compila un APK de depuración.

1. Abrir la pestaña **Actions**.
2. Seleccionar **Build HF Coach APK**.
3. Presionar **Run workflow** para una compilación manual. También se ejecuta automáticamente cuando cambian los segmentos fuente o el workflow en `main`.
4. Al finalizar correctamente, descargar el artefacto `HF-Coach-debug-apk` desde el resumen de la ejecución.

El APK `debug` es para pruebas piloto. No es una versión firmada para distribución pública.

## Estado y requisitos pendientes

- La app conserva el motor de videoanálisis basado en MediaPipe incluido en la entrega original.
- Incluye módulos iniciales de atletas, sesiones, evaluaciones, permisos de intercambio y sincronización opcional.
- Para activar el servidor central hay que crear un proyecto Supabase, ejecutar `supabase/schema.sql` y configurar la URL y la clave pública del proyecto en cada instalación.
- Nunca incorporar la clave `service_role` de Supabase en la aplicación.
- Antes de usar datos reales, completar configuración de autenticación, políticas RLS, consentimientos, retención y eliminación de datos.
- Para atletas menores de edad se debe obtener autorización de sus responsables.
- El análisis visual es orientativo y debe ser revisado por un coach humano; no es diagnóstico médico ni medición biomecánica de laboratorio.

## Administración mixta

La estructura prevé administración central de la organización y gestión de atletas asignados a cada coach. Las autorizaciones de intercambio distinguen perfiles, evaluaciones, notas, actividad y archivos multimedia. La sincronización de esta primera versión es manual y requiere conexión.

## Almacenamiento Android

La aplicación utiliza almacenamiento privado de la app y selectores del sistema para que cada usuario elija videos e imágenes. No solicita acceso indiscriminado a todos los archivos del teléfono.
