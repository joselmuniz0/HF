# HF Coach — proyecto Android

Repositorio privado del proyecto HF Coach. La primera entrega reutiliza la aplicación de videoanálisis existente y la empaqueta para Android mediante Capacitor.

## Compilación del APK

El ZIP fuente original debe estar en la raíz del repositorio con el nombre exacto `HF-Coach-Android-Source.zip`. GitHub Actions verifica su SHA-256, lo extrae, instala dependencias, genera el proyecto Android y compila un APK de depuración.

1. En la pestaña **Code**, seleccionar **Add file → Upload files**.
2. Subir el archivo `HF-Coach-Android-Source.zip` a la raíz del repositorio, sin descomprimirlo ni cambiarle el nombre.
3. Confirmar el commit en la rama `main`.
4. Abrir **Actions** y seleccionar **Build HF Coach APK**. La carga del ZIP también dispara la compilación automáticamente.
5. Al finalizar correctamente, abrir la ejecución y descargar el artefacto `HF-Coach-debug-apk`.

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


## HF Central — informes Android y panel web

La nueva capa de HF Central incorpora:
- Panel plegable de videoanálisis en escritorio, con MediaPipe, carga de videos privados, revisión humana y acceso al análisis desde las fichas del coach y del atleta.
- Pestaña **Informes** en Android para consultar datos sincronizados y registrar la revisión humana de evaluaciones.
- Panel web organizacional para que el administrador consulte coaches, atletas, sesiones e informes.
- Invitaciones propias de coaches con token aleatorio, hash persistido, vista previa no consumible, aceptación explícita y revocación.
- Despliegue del panel web con Vercel mediante `vercel.json`.

Guía operativa: [docs/central-platform-github.md](docs/central-platform-github.md).\n\nFlujo de invitaciones: [docs/coach-invitations.md](docs/coach-invitations.md).

Los archivos de migración, Edge Function y aplicación web se empaquetan en `HF-Central-Overlay.zip`, reconstruido por `scripts/extract-central-overlay.sh`. GitHub Actions publica ese ZIP como artefacto `HF-Central-Setup` junto con cada build Android.
