# HF Coach Central — despliegue e inicialización

Esta entrega incorpora el módulo Informes en Android, el panel web organizacional y la invitación segura de coaches. La pantalla de informes no mostrará datos centrales hasta que Supabase esté configurado y las cuentas estén asociadas a una organización.

## Lo que ya queda en el repositorio

- Los segmentos de `HF-Central-Overlay.zip` están en `.central-source/`.
- `scripts/extract-central-overlay.sh` recompone el paquete y valida su SHA-256.
- GitHub Actions ejecuta ese script, incorpora `reports.js` a Android y compila el APK.
- `vercel.json` configura el despliegue del panel web desde el repositorio privado. No publica datos ni claves secretas.

## 1. Crear el backend Supabase

1. Crear un proyecto Supabase en una región elegida para HF Coach.
2. Abrir SQL Editor y ejecutar primero `supabase/schema.sql` del ZIP original `HF-Coach-Android-Source.zip`.
3. Ejecutar después `supabase/migrations/20261116_hf_central_reports.sql` del paquete `HF-Central-Overlay.zip`.
4. En Authentication → Users, invitar o crear la cuenta que será administradora.
5. Obtener el UUID de esa cuenta y ejecutar el alta inicial:

```sql
insert into public.organizations (name)
values ('HF Coach')
returning id;

-- Reemplazar ambos UUID por los valores reales:
insert into public.organization_memberships (organization_id, user_id, role)
values ('<ORGANIZATION_UUID>', '<ADMIN_USER_UUID>', 'admin');
```

No compartir los UUID de cuentas ni contraseñas fuera de los canales administrativos de la organización.

## 2. Habilitar invitación de coaches

El archivo `supabase/functions/invite-coach/index.ts` debe desplegarse como Edge Function. Configurar los secretos en Supabase, nunca en Android, Vercel, GitHub ni JavaScript del navegador:

```bash
supabase login
supabase link --project-ref <PROJECT_REF>
supabase secrets set SUPABASE_URL=https://<PROJECT_REF>.supabase.co SUPABASE_ANON_KEY=<PUBLIC_ANON_KEY> SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY>
supabase functions deploy invite-coach
```

Configurar un proveedor SMTP/correo en Supabase Auth para que las invitaciones puedan entregarse. El endpoint verifica que quien invita tenga rol `admin` en esa organización.

## 3. Publicar el panel web

1. Crear un proyecto en Vercel y conectar el repositorio privado `joselmuniz0/HF`.
2. Mantener el directorio raíz del proyecto en la raíz del repositorio.
3. Vercel tomará `vercel.json`: el comando recompone el paquete central y publica `.hf-central/admin`.
4. Al abrir el sitio, ingresar la URL de Supabase y la clave pública (anon/publishable) y luego iniciar sesión con la cuenta administradora.

La web estática puede tener URL pública; los datos no. Todas las consultas pasan por Supabase Auth y RLS. El código cliente no debe contener la clave `service_role`.

## 4. Preparar Android

La pestaña Informes queda incluida en el siguiente APK. En cada teléfono:

1. Abrir Intercambio.
2. Configurar la URL y clave pública del mismo proyecto Supabase.
3. Iniciar sesión con la cuenta individual del coach.
4. Revisar los permisos de intercambio y seleccionar atletas/categorías.
5. Ejecutar la sincronización.
6. Abrir Informes y pulsar Actualizar informes.

El administrador puede iniciar sesión tanto en la web como en Android; RLS le permite consultar toda la organización. Un coach sólo ve los atletas propios o asignados y la información existente en el servidor según los permisos/políticas aplicables.

## 5. Prueba piloto requerida

Antes de cargar datos reales, usar datos ficticios y validar:

- Una cuenta admin puede ver los tres coaches, todos los atletas, las sesiones y evaluaciones de la organización.
- Dos cuentas coach distintas no pueden consultar atletas del otro coach salvo asignación explícita.
- El intercambio sólo envía datos seleccionados por el coach.
- Multimedia no se sube sin autorización específica y selección de archivos.
- Informes de Android y web muestran los mismos registros sincronizados.
- Las evaluaciones aparecen pendientes hasta que un coach humano registre la revisión y devolución.

Para atletas menores de edad, obtener previamente la autorización de sus responsables. Acordar retención, exportación y eliminación de información antes del piloto.
