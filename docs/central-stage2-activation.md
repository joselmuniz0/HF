# HF Coach Central — invitaciones manuales sin SMTP

## Objetivo

La etapa actual permite invitar coaches sin contratar un dominio ni un proveedor de correo. El administrador genera un enlace individual desde HF Central y lo comparte directamente por WhatsApp u otro canal privado.

La función utiliza `auth.admin.generateLink({ type: 'invite' })` de Supabase. Supabase crea el enlace de activación, pero no envía un correo. El enlace se devuelve únicamente al administrador autenticado que tiene rol `admin` en la organización.

## Flujo del administrador

1. Abrir [HF Coach Central](https://hf-coach-central.vercel.app/) e iniciar sesión con la cuenta administradora.
2. En la sección **Coaches**, completar nombre y correo del nuevo coach.
3. Pulsar **Invitar coach**.
4. HF Central genera el enlace individual y muestra las opciones **Copiar enlace** y **Compartir por WhatsApp**.
5. Enviar el enlace únicamente al coach destinatario, en una conversación privada.

El alta queda asociada a la organización y al rol `coach`. La función también crea/actualiza el perfil de coach. No se entrega la clave `service_role` al navegador: permanece en el entorno de Supabase Edge Functions.

## Flujo del coach

1. Abrir el enlace personal desde el navegador del teléfono o de una computadora.
2. HF Central valida la sesión temporal de invitación.
3. El coach define y confirma una contraseña personal de al menos 10 caracteres.
4. La cuenta se activa y se cierra la sesión temporal.
5. En la misma pantalla aparece el botón **Descargar HF Coach Android**, los pasos de instalación y los datos públicos para configurar Intercambio.
6. El coach instala el APK, abre **Intercambio**, copia la URL y la clave pública de Supabase que aparecen en esa pantalla e inicia sesión con el mismo correo y contraseña.

El enlace de invitación es de un solo uso. Su vencimiento depende de la configuración de validez de enlaces de Supabase Auth. Si ya se utilizó o venció, el administrador debe generar otra invitación.

## Descarga Android para coaches

El APK de prueba del piloto se distribuye desde Vercel Blob, con una URL pública estable:

- URL: https://ntui7yxdugxgtgoa.public.blob.vercel-storage.com/releases/HF-Coach.apk?download=1&build=68
- Ruta del blob: `releases/HF-Coach.apk`
- El navegador descarga el archivo como `HF-Coach.apk`.
- La pantalla de activación de HF Central muestra este botón después de guardar la contraseña.
- La clave de escritura de Blob permanece en el entorno de Vercel. Nunca incluir `BLOB_READ_WRITE_TOKEN` en la aplicación, HTML, JavaScript del navegador ni repositorio.

El APK actual corresponde a la versión 1.0.68 del 19/11/2026, workflow run 44512876149 (run number 68), commit `0dd7f8d`. La descarga pública usa `build=68` para evitar que un caché anterior entregue el archivo previo. Para reemplazarlo por una versión posterior, subir el nuevo APK al mismo pathname con `allowOverwrite: true` desde un entorno autorizado. La URL pública no cambia.

## Configuración necesaria de Supabase Auth

En **Authentication → URL Configuration** del proyecto HF App:

- **Site URL:** `https://hf-coach-central.vercel.app`
- **Redirect URLs:** agregar exactamente `https://hf-coach-central.vercel.app/?flow=invite`

Esta configuración es necesaria para que Supabase permita volver al panel después de validar la invitación. No agregar dominios de Preview a producción salvo que se utilicen expresamente.

Enlace directo: https://supabase.com/dashboard/project/mzjwiwyelabulwhlrgrt/auth/url-configuration

## Correo y recuperación de contraseña

- Para crear y compartir invitaciones de coaches no se necesita SMTP.
- No se envía ningún correo durante este flujo.
- Mientras no exista un proveedor SMTP configurado, las funciones estándar de recuperación por correo de Supabase no están disponibles para coaches externos. La recuperación asistida debe resolverse mediante un flujo administrativo separado antes de ofrecer esa función.
- No compartir enlaces de activación por grupos ni publicarlos en espacios abiertos.

## Archivos versionados

- `supabase/functions/invite-coach/index.ts`: genera el enlace con la clave de servicio en el servidor, exige sesión válida y rol admin, crea la membresía coach y el perfil.
- `scripts/patch-central-stage2.mjs`: incorpora la pantalla para definir contraseña.
- `scripts/patch-central-stage3.mjs`: incorpora el enlace visible, copia y envío por WhatsApp.
- `scripts/extract-central-overlay.sh`: aplica los parches durante la compilación y el despliegue.

La Edge Function se despliega con `verify_jwt=false` porque valida expresamente el bearer token con `auth.getUser()` y comprueba el rol de administrador en la base de datos. No modificar esa condición sin revisar primero el flujo de autenticación.

## Prueba controlada antes del piloto

1. Confirmar que Site URL y Redirect URL estén configuradas.
2. Iniciar sesión como administrador y generar una invitación para una dirección de correo controlada y todavía no registrada.
3. Compartir el enlace por WhatsApp o copiarlo a un navegador.
4. Establecer la contraseña y confirmar la activación.
5. Verificar en Authentication → Users que el usuario figure como confirmado y en `organization_memberships` que tenga rol `coach`.
6. Iniciar sesión con esa cuenta en HF Coach Android.
7. Comprobar el aislamiento de datos entre coaches antes de cargar información real de atletas.

La interpretación de evaluaciones y las decisiones deportivas permanecen bajo control del coach humano durante el piloto.
