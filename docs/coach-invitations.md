# HF Coach Central — invitaciones propias de coaches

## Estado

Este flujo reemplaza los enlaces de un solo uso de Supabase Auth para incorporar coaches. La creación de una invitación no otorga permisos; el rol `coach` se asigna únicamente al confirmar la invitación en el servidor.

## Flujo

1. Un administrador autenticado completa nombre y correo en **Coaches → Invitar coach**.
2. La Edge Function `create-coach-invitation` valida la sesión y la membresía `admin` de la organización.
3. Supabase genera 32 bytes aleatorios (256 bits). En la base se almacena solamente el SHA-256 del token, nunca el token original.
4. HF Central devuelve un enlace propio con el token en el fragmento `#coach_invite=`. El fragmento no se envía al servidor en la solicitud HTTP ni en el encabezado `Referer`.
5. El administrador lo comparte por WhatsApp. La lectura de la página y la vista previa son de solo lectura: abrir o inspeccionar el enlace no consume la invitación.
6. Un coach con cuenta existente inicia sesión con su correo y contraseña; el servidor comprueba que el correo de la sesión coincide con el destinatario.
7. Un coach nuevo define una contraseña de 12 a 128 caracteres. La cuenta se crea en el servidor y la invitación se acepta en la misma operación lógica.
8. La función SQL consume la invitación una sola vez y crea/actualiza la membresía y el perfil del coach. Si la operación falla, la transacción revierte el consumo.

## Vencimiento, revocación y reenvío

- Cada invitación vence a las 72 horas.
- Crear otra invitación para el mismo correo y organización revoca cualquier invitación anterior que siga pendiente.
- Desde **Invitaciones de coaches** el administrador puede consultar estados y revocar enlaces pendientes.
- Los estados son pendiente, aceptada, revocada o vencida.
- Una invitación aceptada no se puede reutilizar.

## Componentes

### Base de datos

- Tabla `public.coach_invitations`, con RLS habilitado.
- Los roles `anon` y `authenticated` no tienen privilegios directos sobre la tabla.
- El token se persiste como hash SHA-256.
- La función `public.accept_coach_invitation` tiene `SECURITY INVOKER` y su ejecución está concedida solo a `service_role`.
- La aceptación comprueba correo, vigencia, revocación y uso previo. No permite convertir una cuenta admin en coach.

### Edge Functions

| Función | Responsabilidad |
| --- | --- |
| `create-coach-invitation` | Validar administrador, generar token, revocar invitación previa e insertar nueva invitación |
| `accept-coach-invitation` | Vista previa, aceptación de cuenta existente o creación y aceptación de cuenta nueva |
| `manage-coach-invitations` | Listar invitaciones de organizaciones donde el usuario es admin y revocar invitaciones pendientes |

Las funciones tienen `verify_jwt=false` para permitir la vista previa pública del enlace. Cada operación protegida valida expresamente el bearer token mediante `auth.getUser()` y vuelve a comprobar el rol admin o la identidad del destinatario. La clave `service_role` permanece en el entorno de Edge Functions y nunca se envía al navegador.

### Panel web

- `scripts/coach-invitations.js` controla la pantalla pública de bienvenida y el listado administrativo.
- `scripts/patch-central-coach-invitations.mjs` integra la pantalla y sustituye el controlador anterior de invitaciones durante el build.
- `scripts/extract-central-overlay.sh` ejecuta el parche y copia las funciones y la migración al paquete de configuración.

## Compatibilidad con el flujo anterior

Los endpoints heredados `invite-coach` e `invitacion-coach` fueron desactivados y responden HTTP 410. Ya no pueden crear membresías directamente. Las invitaciones nuevas deben salir exclusivamente de `create-coach-invitation`; las cuentas y perfiles existentes no se eliminan ni se modifican al desactivar esos endpoints.

## Supuesto de seguridad del alta nueva

En una invitación nueva, la posesión del enlace personal de 256 bits es la prueba de autorización para crear la cuenta a nombre del correo invitado; por eso el alta confirma el correo en Supabase sin enviar un segundo correo. Compartir el enlace equivale a entregar esa autorización. Debe enviarse únicamente al destinatario por un canal privado. El sistema limita el riesgo con token aleatorio, hash persistido, vencimiento de 72 horas, revocación y aceptación de un solo uso.

En cuentas existentes no se cambia la contraseña: el coach debe iniciar sesión con su contraseña habitual y el servidor verifica que el correo de la sesión coincida con la invitación.

## Pruebas de aceptación

- Abrir varias veces una invitación pendiente no la consume.
- La vista previa desde un navegador sin sesión no revela el token ni modifica la invitación.
- Un correo diferente no puede aceptar la invitación.
- Una cuenta existente puede iniciar sesión y aceptar; una cuenta nueva puede crearse y aceptar.
- Dos aceptaciones concurrentes no pueden consumir la misma invitación.
- Una invitación vencida o revocada no se puede aceptar.
- Revocar una invitación impide su aceptación posterior.
- Un usuario no admin no puede crear ni revocar invitaciones.
- La membresía y el perfil del coach aparecen después de la aceptación, nunca al crear la invitación.
- Los tres coaches de la prueba piloto pueden ingresar de forma independiente y mantienen el aislamiento de atletas previsto por RLS.

La revisión humana y las decisiones deportivas permanecen bajo control de los coaches durante el piloto.
