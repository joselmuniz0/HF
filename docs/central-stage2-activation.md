# HF Coach Central - etapa 2: activacion de coaches

## Cambios incluidos

- El panel central muestra una pantalla de activacion cuando el coach llega desde una invitacion con el parametro flow=invite.
- El coach define y confirma una contrasena de al menos 10 caracteres.
- El cliente Supabase usa flujo implicit solo para el callback de invitacion y conserva PKCE para el inicio de sesion habitual del administrador.
- La Edge Function supabase/functions/invite-coach/index.ts verifica la sesion del solicitante y exige rol admin en la organizacion antes de invitar.
- El destino del correo usa por defecto https://hf-coach-central.vercel.app; HF_CENTRAL_SITE_URL es un override opcional para cambiar el dominio.
- Vercel genera config.js en el proceso de build a partir de HF_SUPABASE_URL y HF_SUPABASE_PUBLISHABLE_KEY. Son variables publicas; nunca colocar service_role en Vercel.

## Vercel

Configurar las variables de entorno para Production y, si se desea probar antes de publicar, tambien para Preview:

- HF_SUPABASE_URL: URL HTTPS del proyecto Supabase.
- HF_SUPABASE_PUBLISHABLE_KEY: clave publishable del proyecto; tambien se admite la clave publica legacy anon.

El archivo vercel.json ejecuta scripts/extract-central-overlay.sh y despues scripts/build-central-config.mjs. El directorio de publicacion es .hf-central/admin.

## Supabase Auth URLs

En Authentication -> URL Configuration:

- Site URL: URL HTTPS del panel Vercel.
- Redirect URLs: agregar la URL exacta del panel y el patron https://<dominio-vercel>/**.

La funcion envia invitaciones a https://<dominio-vercel>/?flow=invite. Esa URL debe estar permitida en la lista Redirect URLs.

## SMTP

En Authentication -> SMTP Settings, configurar un proveedor SMTP propio con remitente verificado, host, puerto, usuario y contrasena. Probar primero con una cuenta controlada. El SMTP de prueba no debe usarse como servicio de produccion.

## Edge Function

La fuente versionada esta en supabase/functions/invite-coach/index.ts. Para actualizar el despliegue desde el Dashboard:

1. Abrir Edge Functions -> invite-coach -> Code.
2. Reemplazar el codigo por el contenido del archivo versionado.
3. Confirmar que Verify JWT with legacy secret permanezca OFF, porque la funcion valida el bearer token mediante auth.getUser() y verifica rol admin en la base.
4. Deploy new version.
5. No es necesario configurar HF_CENTRAL_SITE_URL mientras se use https://hf-coach-central.vercel.app. Si el dominio cambia, configurar ese secreto con la nueva URL HTTPS, sin barra final.

Supabase proporciona a las Edge Functions SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY como variables de entorno del proyecto. La clave de servicio solo se usa dentro de la funcion y nunca debe incorporarse a Android, navegador, GitHub o Vercel.

## Prueba controlada

1. Ingresar al panel con la cuenta admin.
2. Invitar una direccion de correo de prueba.
3. Confirmar la recepcion del mensaje y abrir el enlace.
4. Comprobar que el navegador abre el panel con ?flow=invite y presenta el formulario de activacion.
5. Definir contrasena, confirmar y comprobar el mensaje de activacion.
6. Ingresar nuevamente al panel y, luego, a Android con esa cuenta.
7. Confirmar en Authentication -> Users y organization_memberships que el usuario existe y tiene rol coach.

No incorporar datos reales de atletas hasta validar aislamiento entre coaches y administrador mediante cuentas de prueba.

## Seguridad de acceso (migration 20261117201547)

La migracion `supabase/migrations/20261117201547_restrict_private_rls_to_authenticated.sql` cambia las 31 politicas RLS de las tablas privadas del rol PUBLIC a AUTHENTICATED, preservando sus expresiones de acceso. Tambien revoca la ejecucion anonima de las funciones helper `can_access_athlete`, `is_org_admin` e `is_org_member`, manteniendo sus permisos para `authenticated` y `service_role`.

La migracion se aplico al proyecto HF App y se verifico que las 31 politicas quedaron en `{authenticated}` y que `anon` no tiene permiso EXECUTE sobre esas tres funciones.

## Pendientes de configuracion manual de Auth

- En Authentication -> URL Configuration, establecer Site URL en `https://hf-coach-central.vercel.app` y agregar esa URL exacta (o `https://hf-coach-central.vercel.app/**`) a Redirect URLs.
- En Authentication -> SMTP Settings, configurar proveedor SMTP propio y remitente verificado. El SMTP de prueba de Supabase solo permite destinatarios autorizados del equipo y tiene limites reducidos.
- Activar leaked password protection en Auth password security.

No invitar coaches externos hasta finalizar esos ajustes y realizar una prueba controlada de activacion.
